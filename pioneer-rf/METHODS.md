# Pioneer 6 RF Lab — methods and provenance

## Purpose

This page is a research sandbox for comparing a classical weak-carrier receiver with an actually trained transformer policy. It does **not** assert that Pioneer 6 is transmitting today. The "Synthetic transmit" mode is closed-loop simulation only and intentionally does not implement real spacecraft command words or operational uplink procedure.

## Historical inputs used

- NASA Science, *Pioneer 06*: launch 16 Dec 1965; spacecraft mass 62.14 kg; heliocentric mission; last contact 8 Dec 2000.
  https://science.nasa.gov/mission/pioneer-6/
- NASA/JPL telecommunications historical survey, NASA-CR-164003, tables 2–3: Pioneer 6 S-band telemetry range 8–512 bit/s, collinear broadside array gain 11.2 dBi, S-band spacecraft transmitter power 8 W.
  https://ntrs.nasa.gov/citations/19810010458
- DSN historical report for the 1969–70 Pioneer 6/7 solar experiment gives a Pioneer 6 downlink frequency of 2292.021400 MHz for the cited pass.
  https://ntrs.nasa.gov/citations/19730016111
- NASA Pioneer telemetry documentation describes 8, 16, 64, 256 and 512 bit/s modes and the low-rate frame formats.
  https://ntrs.nasa.gov/citations/19690003869

The browser uses 2292.0214 MHz as a historical reference carrier, not a promise about the frequency or existence of a present-day signal.

## Physical model

For user-selected Earth-spacecraft range R, receive aperture diameter D and coherent element count N:

- wavelength: lambda = c / f
- receive aperture gain: G_r = eta (pi D / lambda)^2 N
- free-space received power: P_r = P_t G_t G_r (lambda / 4 pi R)^2 / L
- noise density: N_0 = k T_sys
- carrier-to-noise density: C/N0 = P_r / N_0
- Eb/N0 = C/N0 / R_b
- bandwidth SNR = P_r / (k T_sys B)
- Shannon capacity: C = B log2(1 + SNR)
- one-way light time = R / c

The uncoded BPSK BER display is the ideal AWGN expression. RFI and oscillator effects are simulated separately, so the BER number is a reference, not a total field BER prediction.

The array mass comparison uses a generic structural scaling M proportional to D^2.7. It is included only to illustrate why many small apertures can move engineering difficulty from structure into timing/correlation. It is not a hardware mass estimate.

## Synthetic learned-receiver channel

Each training example is a 24 x 16 log-power waterfall. The generator adds:

1. exponential thermal-noise power,
2. a weak drifting target ridge selected from 9 drift classes,
3. a repeated six-step synthetic pilot/frame envelope on the target,
4. strong stationary narrowband interferers,
5. an often-stronger moving decoy on another allowed drift class,
6. moving off-grid interference, and
7. broadband impulsive bursts.

The target pilot is synthetic. Its purpose is to test whether a learned receiver can exploit repeated structure that a blind carrier-only de-drift search ignores. If the exact target waveform were known and supplied to an optimal classical matched filter in stationary Gaussian noise, the matched filter remains the correct optimum. The page does not claim neural networks violate that result.

## Transformer

train_receiver.py trains the checkpoint in trained_weights.json.

Architecture:

- 24 time tokens x 16 spectral features
- linear input projection
- sinusoidal time position encoding
- one 4-head self-attention block
- GELU feed-forward block
- LayerNorm residual paths
- time-preserving flattened transformer representation
- 9-action drift policy head

Training:

1. AdamW supervised warm-start on randomized synthetic channels.
2. REINFORCE fine-tuning. A sampled drift action receives dense reward exp(-0.85 * error^2), approximating coherence loss from imperfect de-drift.
3. Held-out evaluation against the classical comparator.
4. Browser continuation: transformer encoder is frozen; the actor head keeps updating with REINFORCE from simulated lock/frame reward. Its online adapter uses an L2-normalized frozen-transformer embedding plus a small weight-decay anchor, limiting catastrophic drift. The web UI exposes update count, reward EMA and policy entropy.

Seed: 260923.

## Classical comparator

The baseline receives exactly the same 24 x 16 normalized waterfall. It performs:

1. temporal-median subtraction per frequency bin,
2. a grid search over the same nine de-drift slopes and possible intercepts,
3. 80th-percentile winsorisation to reduce burst sensitivity,
4. maximum matched-energy selection.

This is a credible blind weak-carrier baseline, but it is deliberately **not** given the synthetic six-step target pilot. The learned model's acceptance test is therefore specifically: can training exploit target structure and reject structured RFI better than blind carrier-energy search?

## Acceptance rule

The UI reads the benchmark embedded in the checkpoint. It marks the checkpoint accepted only when held-out exact drift-class accuracy under structured RFI is higher for the transformer than the classical comparator. Clean-channel results remain visible because the classical method can and should remain very strong in its ideal regime.

No benchmark number is hard-coded in the page.
