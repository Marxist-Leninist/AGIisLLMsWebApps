# Pioneer RF Lab — Methods and validation

## Scope

This is a browser simulation for receive-side weak-signal work and a closed synthetic transmit/loopback experiment. It does **not** encode or transmit Pioneer spacecraft commands.

## Historical spacecraft values

The simulation uses these historical inputs for Pioneer 6:

- Spacecraft mass: **62.14 kg (137 lb)**. NASA Science lists 62.14 kg and identifies the final contact as 8 December 2000.
- Spin stabilization: approximately **60 rpm**.
- S-band downlink: approximately **2292 MHz**. A NASA/JPL Pioneer 6/7 telemetry requirements table gives Pioneer 6A as **2292.037037 MHz**.
- Spacecraft RF output: approximately **8 W**.
- Telemetry rates: **512, 256, 64, 16, and 8 bit/s**.

Primary references:

1. NASA Science, *Pioneer 06*: https://science.nasa.gov/mission/pioneer-6/
2. NASA Technical Reports Server, *Pioneer 6 through 8* (DSN mission support requirements), NTRS 19920003902: https://ntrs.nasa.gov/search.jsp?R=19920003902
3. NASA/JPL telemetry requirements table, NTRS 19730009155: https://ntrs.nasa.gov/api/citations/19730009155/downloads/19730009155.pdf
4. NASA Technical Reports Server, *Tracking and data system support for the Pioneer project — Pioneer 6 extended mission*, NTRS 19710009937: https://ntrs.nasa.gov/citations/19710009937
5. IEEE Spectrum, April 1966, contemporary interplanetary communications comparison, listing Pioneer VI at 2292 MHz and 8 W.

The **11.2 dBi spacecraft transmit-gain default** is an engineering assumption used for the sandbox link budget, not claimed here as an independently verified spacecraft-state measurement for the final 2000 contact.

## Link physics

The page computes:

- parabolic receiving-aperture gain
- Friis free-space propagation
- received carrier power
- Boltzmann thermal-noise density, `N0 = kT`
- `C/N0`
- `Eb/N0` for the selected telemetry rate
- uncoded coherent BPSK AWGN bit-error probability
- finite-bandwidth Shannon capacity, `B log2(1 + S/N)`
- one-way and round-trip light time

The default 2028-style range is an **experimental range input**, not an ephemeris claim made by this page. Orbit/pointing prediction belongs in a separate ephemeris model.

Array gain is modeled as ideal coherent combination: N equal elements add N times receiving power (equivalent diameter scales as sqrt(N)). The mass comparison uses the illustrative scaling `M ∝ D^2.7`; it is not a mechanical design estimate.

## Learned receiver

The trained input is a **24 × 16 log-power waterfall**. Synthetic training examples include:

- exponential thermal-power noise
- a drifting narrow carrier
- stationary narrowband RFI
- off-grid moving interferers
- impulsive broadband bursts
- a stronger on-grid moving decoy
- a six-step repeated pilot/frame envelope on the target

Architecture:

- linear 16 → 24 channel projection
- sinusoidal time positions
- one 4-head self-attention block
- 48-wide feed-forward sublayer
- flattened 24 × 24 time-indexed representation
- 9-action drift policy head

Training is two-stage:

1. supervised warm start on randomly generated channel realizations
2. REINFORCE policy fine-tuning, where reward decays with residual drift error

The browser loads the exported trained weights. During the live run the transformer encoder remains frozen and the policy head continues **online REINFORCE** updates from the simulated frame/lock reward. The online learner is therefore real parameter adaptation, not an animation.

## Classical comparator

The classical receiver receives the exact same waterfall. It performs:

1. temporal-median subtraction per frequency bin
2. nine candidate de-drift searches
3. intercept sweep
4. winsorised matched-energy integration to limit impulsive RFI

This is deliberately a capable blind carrier detector rather than a strawman. It does not know the synthetic six-step target pilot envelope.

## Accepted checkpoint

Seed: **260923**

Held-out structured-RFI set:
- transformer exact drift-bin accuracy: **70.56%**
- classical exact drift-bin accuracy: **33.33%**
- transformer within ±1 bin: **93.89%**
- classical within ±1 bin: **41.11%**

Held-out cleaner set:
- transformer exact drift-bin accuracy: **87.38%**
- classical exact drift-bin accuracy: **75.69%**
- transformer within ±1 bin: **99.38%**
- classical within ±1 bin: **89.54%**

The first trained checkpoint was rejected because the classical pipeline still won exact classification. The deployed checkpoint is the later model that preserved time-indexed transformer features so the repeated target structure was learnable.

## Interpretation

The learned receiver does **not** beat thermal noise or Shannon capacity. Its gain comes from using structure that the blind classical comparator does not exploit and from adapting its search policy under non-Gaussian interference. In pure idealized AWGN with a perfectly specified signal, a matched filter remains the appropriate optimum reference.

The simulation therefore demonstrates a realistic boundary: ML can improve estimation and interference rejection when there is exploitable signal/channel structure, but it cannot manufacture information that never reached the antenna.
