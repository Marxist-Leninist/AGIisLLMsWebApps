#!/usr/bin/env python3
"""
Train the Pioneer RF sandbox receiver.

The task is deliberately synthetic: infer a drifting weak carrier's de-drift
class from a short log-power waterfall corrupted by thermal noise, stationary
RFI, moving interferers, and impulsive bursts.

Stage 1: supervised warm-start.
Stage 2: REINFORCE fine-tuning of the transformer policy.
Outputs browser-readable trained_weights.json + benchmark.json.
"""
from __future__ import annotations
import argparse, json, math, random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.distributions import Categorical

SEED = 260923
T = 24
F = 16
NCLASS = 9
SLOPES = np.linspace(-0.24, 0.24, NCLASS, dtype=np.float32)


def seed_all(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def make_batch(n: int, rfi: bool = True, device="cpu"):
    # Positive power samples with exponential thermal-noise statistics.
    x = np.random.exponential(1.0, size=(n, T, F)).astype(np.float32)
    y = np.random.randint(0, NCLASS, size=n)
    f0 = np.random.uniform(4.5, 10.5, size=n)
    snr_db = np.random.uniform(-3.0, 6.0, size=n)
    p_sig = np.power(10.0, snr_db / 10.0) * np.random.uniform(5.0, 10.0, size=n)

    tt = np.arange(T, dtype=np.float32)
    ff = np.arange(F, dtype=np.float32)
    tc = (T - 1) / 2
    for i in range(n):
        track = f0[i] + SLOPES[y[i]] * (tt - tc)
        # Narrow drifting carrier ridge.
        for t in range(T):
            pilot = (1.00, 0.10, 0.92, 0.08, 1.08, 0.12)[t % 6]
            x[i, t] += p_sig[i] * pilot * np.exp(-0.5 * ((ff - track[t]) / 0.42) ** 2)

        if rfi:
            # Strong stationary narrowband RFI: the classical "brightest line"
            # failure mode common in urban RF environments.
            if np.random.rand() < 0.82:
                for _ in range(np.random.randint(1, 3)):
                    rf = np.random.uniform(1.0, F - 2.0)
                    amp = np.random.uniform(3.0, 12.0)
                    x[i] += amp * np.exp(-0.5 * ((ff[None, :] - rf) / 0.32) ** 2)

            # Strong moving decoy on the SAME slope grid but without the target's
            # learned six-step pilot/frame envelope. A blind carrier-energy search
            # can lock to it; the transformer can learn the temporal structure.
            if np.random.rand() < 0.72:
                choices = [j for j in range(NCLASS) if abs(j-y[i]) >= 2]
                dj = np.random.choice(choices)
                df0 = np.random.uniform(4.0, 11.0)
                damp = p_sig[i] * np.random.uniform(1.15, 2.1)
                dtrack = df0 + SLOPES[dj] * (tt - tc)
                for t in range(T):
                    x[i, t] += damp * np.exp(-0.5 * ((ff - dtrack[t]) / 0.40) ** 2)

            # A moving interferer that is not on the allowed signal slope grid.
            if np.random.rand() < 0.35:
                rf0 = np.random.uniform(3.0, 12.0)
                rs = np.random.uniform(-0.33, 0.33)
                amp = np.random.uniform(1.5, 8.0)
                for t in range(T):
                    rf = rf0 + rs * (t - tc)
                    x[i, t] += amp * np.exp(-0.5 * ((ff - rf) / 0.38) ** 2)

            # Broadband impulsive bursts.
            if np.random.rand() < 0.55:
                for _ in range(np.random.randint(1, 4)):
                    tr = np.random.randint(0, T)
                    x[i, tr] += np.random.exponential(
                        np.random.uniform(3.0, 10.0), size=F
                    ).astype(np.float32)

    # Log-power + per-sample robust normalization. This is also reproduced in JS.
    z = np.log1p(x)
    med = np.median(z, axis=(1, 2), keepdims=True)
    mad = np.median(np.abs(z - med), axis=(1, 2), keepdims=True) + 1e-3
    z = (z - med) / (1.4826 * mad)
    z = np.clip(z, -4.0, 8.0).astype(np.float32)
    return torch.tensor(z, device=device), torch.tensor(y, dtype=torch.long, device=device)


def positional_encoding(t=T, d=24):
    pe = np.zeros((t, d), np.float32)
    pos = np.arange(t, dtype=np.float32)[:, None]
    div = np.exp(np.arange(0, d, 2, dtype=np.float32) * (-math.log(10000.0) / d))
    pe[:, 0::2] = np.sin(pos * div)
    pe[:, 1::2] = np.cos(pos * div)
    return torch.tensor(pe)


class TinyRFTransformer(nn.Module):
    def __init__(self, din=F, d=24, heads=4, ff=48, nclass=NCLASS):
        super().__init__()
        assert d % heads == 0
        self.d = d
        self.heads = heads
        self.inp = nn.Linear(din, d)
        self.q = nn.Linear(d, d)
        self.k = nn.Linear(d, d)
        self.v = nn.Linear(d, d)
        self.o = nn.Linear(d, d)
        self.ln1 = nn.LayerNorm(d)
        self.ff1 = nn.Linear(d, ff)
        self.ff2 = nn.Linear(ff, d)
        self.ln2 = nn.LayerNorm(d)
        self.cls = nn.Linear(d*T, nclass)
        self.register_buffer("pe", positional_encoding(T, d), persistent=False)

    def encode(self, x):
        x = self.inp(x) + self.pe[None, :, :]
        b, t, d = x.shape
        h = self.heads
        hd = d // h

        def split(a):
            return a.view(b, t, h, hd).transpose(1, 2)

        q, k, v = split(self.q(x)), split(self.k(x)), split(self.v(x))
        a = torch.softmax((q @ k.transpose(-1, -2)) / math.sqrt(hd), dim=-1)
        ctx = (a @ v).transpose(1, 2).contiguous().view(b, t, d)
        x = self.ln1(x + self.o(ctx))
        x = self.ln2(x + self.ff2(torch.nn.functional.gelu(self.ff1(x), approximate="tanh")))
        return x.flatten(1)

    def forward(self, x):
        return self.cls(self.encode(x))


@torch.no_grad()
def classical_predict(z: torch.Tensor):
    # Robust de-drift matched-energy search. It gets the same waterfall as the NN.
    # First remove persistent per-frequency contamination with a temporal median.
    a = z.cpu().numpy()
    residual = a - np.median(a, axis=1, keepdims=True)
    n = a.shape[0]
    out = np.zeros(n, np.int64)
    tt = np.arange(T, dtype=np.float32)
    tc = (T - 1) / 2
    intercepts = np.arange(2.0, F - 2.0, 0.5, dtype=np.float32)
    for i in range(n):
        best_s, best_score = 0, -1e30
        for si, slope in enumerate(SLOPES):
            score_s = -1e30
            for f0 in intercepts:
                track = f0 + slope * (tt - tc)
                idx = np.clip(np.rint(track).astype(int), 0, F - 1)
                vals = residual[i, np.arange(T), idx]
                # Winsorise bursts; a practical classical RFI defence.
                lim = np.percentile(vals, 80)
                score = np.minimum(vals, lim).sum()
                if score > score_s:
                    score_s = score
            if score_s > best_score:
                best_s, best_score = si, score_s
        out[i] = best_s
    return torch.tensor(out, device=z.device)


@torch.no_grad()
def evaluate(model, n=2500, rfi=True, batch=250, device="cpu"):
    model.eval()
    good_nn = good_cl = near_nn = near_cl = 0
    total = 0
    for _ in range((n + batch - 1) // batch):
        m = min(batch, n - total)
        if m <= 0:
            break
        x, y = make_batch(m, rfi=rfi, device=device)
        p = model(x).argmax(1)
        c = classical_predict(x)
        good_nn += (p == y).sum().item()
        good_cl += (c == y).sum().item()
        near_nn += ((p - y).abs() <= 1).sum().item()
        near_cl += ((c - y).abs() <= 1).sum().item()
        total += m
    return {
        "n": total,
        "transformer_accuracy": good_nn / total,
        "classical_accuracy": good_cl / total,
        "transformer_within_one_bin": near_nn / total,
        "classical_within_one_bin": near_cl / total,
    }


def reward_for_action(action, target):
    err = (action - target).abs().float()
    # Dense reward approximates residual coherent loss after an imperfect de-drift.
    return torch.exp(-0.85 * err * err)


def export_model(model, path: Path, bench: dict):
    sd = model.state_dict()
    names = [
        "inp.weight","inp.bias","q.weight","q.bias","k.weight","k.bias",
        "v.weight","v.bias","o.weight","o.bias","ln1.weight","ln1.bias",
        "ff1.weight","ff1.bias","ff2.weight","ff2.bias","ln2.weight","ln2.bias",
        "cls.weight","cls.bias"
    ]
    payload = {
        "schema": 1,
        "seed": SEED,
        "architecture": {
            "t": T, "f": F, "d_model": model.d, "heads": model.heads,
            "ff": model.ff1.out_features, "classes": NCLASS, "embedding_dim": model.d*T,
            "slopes_bins_per_step": SLOPES.tolist(),
            "normalization": "log1p + median/MAD, clip[-4,8]",
            "online_update": "REINFORCE on classifier actor head; frozen transformer encoder",
        },
        "benchmark": bench,
        "weights": {k: sd[k].detach().cpu().float().tolist() for k in names},
    }
    path.write_text(json.dumps(payload, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=420)
    ap.add_argument("--rl-steps", type=int, default=140)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--out", type=Path, default=Path(__file__).with_name("trained_weights.json"))
    ap.add_argument("--benchmark", type=Path, default=Path(__file__).with_name("benchmark.json"))
    args = ap.parse_args()

    seed_all()
    device = "cpu"
    torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
    model = TinyRFTransformer().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=2.4e-3, weight_decay=2e-4)

    # Supervised warm-start on the same stochastic channel family used for RL.
    model.train()
    ema = None
    for step in range(1, args.steps + 1):
        x, y = make_batch(args.batch, rfi=True, device=device)
        logits = model(x)
        loss = nn.functional.cross_entropy(logits, y, label_smoothing=0.025)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        ema = loss.item() if ema is None else 0.96 * ema + 0.04 * loss.item()
        if step % 70 == 0 or step == 1:
            print(f"pretrain step={step:4d} loss={loss.item():.4f} ema={ema:.4f}", flush=True)

    # Reward fine-tuning. The synthetic environment can supply reward exactly;
    # the browser continuation instead uses observable lock/frame reward.
    opt = torch.optim.AdamW(model.parameters(), lr=2.5e-4, weight_decay=1e-5)
    baseline = 0.0
    for step in range(1, args.rl_steps + 1):
        x, y = make_batch(args.batch, rfi=True, device=device)
        logits = model(x)
        dist = Categorical(logits=logits)
        action = dist.sample()
        reward = reward_for_action(action, y)
        mean_r = reward.mean().item()
        baseline = 0.96 * baseline + 0.04 * mean_r if step > 1 else mean_r
        adv = reward - baseline
        loss = -(dist.log_prob(action) * adv.detach()).mean() - 0.004 * dist.entropy().mean()
        opt.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 0.8)
        opt.step()
        if step % 35 == 0 or step == 1:
            print(f"rl step={step:4d} reward={mean_r:.4f} baseline={baseline:.4f} loss={loss.item():.4f}", flush=True)

    rfi_bench = evaluate(model, 900, True, device=device)
    clean_bench = evaluate(model, 650, False, device=device)
    bench = {
        "seed": SEED,
        "task": "9-way carrier drift-bin recovery from 24x16 log-power waterfall",
        "held_out_rfi": rfi_bench,
        "held_out_clean": clean_bench,
        "note": "Classical comparator is a robust de-drift matched-energy search with temporal-median RFI removal and burst winsorisation. Same waterfall input; NN advantage is expected mainly under non-Gaussian/RFI conditions, not ideal AWGN.",
    }
    print(json.dumps(bench, indent=2))
    args.benchmark.write_text(json.dumps(bench, indent=2))
    export_model(model, args.out, bench)


if __name__ == "__main__":
    main()
