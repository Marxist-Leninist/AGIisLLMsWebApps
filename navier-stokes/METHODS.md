# Physical-air vortex laboratory

This application extends the earlier Navier–Stokes visualisation with a real numerical evolution of a specified compressible-gas model. It is an exploratory calculation of a finite physical analogue. It is **not** a numerical reconstruction of the uploaded manuscript's singular solution, nor experimental validation of a material singularity.

## Scope and provenance

The uploaded *Finite Time Blowup for Navier–Stokes*, section 2 and Figure 1 (page 4), motivates inward spiralling and two-sided axial outflow. Its incompressible intensity core is an Eulerian observation region, not a compressed material parcel (section 3.1, page 8). The full profiles, pulse families and residual-correction forcing are not instantiated here. The reference length and finite initial vortex below are choices for this experiment, not fitted or certified parameters of the theorem. The app's time is physical time in microseconds, not the manuscript's singular-time variable.

The additional constitutive laws and conservation equations are sourced separately below. The earlier prescribed-velocity illustration is retained as `reference.html`, clearly labelled as an illustration, not a control experiment with identical forcing.

## Governing equations

Let E be total energy per unit volume, including internal and kinetic energy:

    d_t rho + div(rho u) = 0
    d_t(rho u) + div(rho u tensor u + p I - sigma) = rho f
    d_t E + div((E+p)u - sigma u - kappa grad T) = rho f dot u
    d_t(rho C) + div(rho C u) = 0
    p = rho R T = (gamma-1)(E - rho |u|^2/2)
    sigma = mu [grad u + (grad u)^T - (2/3) div(u) I]

Here C is a massless passive optical marker. There is no source of tracer after initialisation. Tracer detail is not a separate physical component of air. No buoyancy, radiation, chemical reactions, surface tension, phase transitions, electromagnetic forces, nuclear reactions or gravity are included. Stokes' zero-bulk-viscosity approximation and constant heat capacities are limitations, not assertions that molecular relaxation never matters.

Viscous stress work belongs in the conservative total-energy flux. The code does **not** add viscous heating twice. It separately integrates a diagnostic of `sigma : grad u` using centred gradients. This quadrature is approximate and need not equal the discrete kinetic-energy decrement exactly. The Rusanov flux also causes numerical kinetic-energy dissipation, particularly on coarse meshes and near steep gradients. Conservation alone does not quantify the associated solution error.

## Dry-air example and scaling

Initial temperature: 300 K. Initial absolute pressure: 101325 Pa.

    R = 287.05 J/(kg K)
    gamma = 1.4
    rho0 = p0/(R T0) = 1.176624281484062 kg/m^3
    c0 = sqrt(gamma R T0) = 347.2189510957027 m/s
    L0 = 100 micrometres by default
    t0 = L0/c0 = 0.2880027132287413 microseconds

Spatial variables are normalised by L0, velocities by c0, density by rho0, temperature by T0, pressure and energy density by rho0*c0^2. The box is `[-4,4]^3`, periodic in all three directions. Thus the default physical box is 800 micrometres on a side.

The dimensionless gas pressure is `p = rho*theta/gamma`, internal-energy density is `rho*theta/[gamma*(gamma-1)]`, and sound speed is `sqrt(theta)`. The observation window is dimensionless t=0 to 2.5, or 0.7200067830718532 microseconds at the default scale. This endpoint is not a blowup time. At other reference lengths the physical observation time changes consistently.

Temperature-dependent physical transport:

    mu(T) = 1.716e-5 * (T/273)^1.5 * (273+111)/(T+111) Pa s
    kappa(T) = 0.0241 * (T/273)^1.5 * (273+194)/(T+194) W/(m K)

Dimensionless coefficients in the conservative equations:

    mu_hat = mu/(rho0*c0*L0)
    kappa_hat = kappa*T0/(rho0*c0^3*L0)

## Initial fields

The coordinate y is the vortex axis; r^2=x^2+z^2. With Rb=2.8 and Zb=3.1, define

    br = exp(-r^2/(Rb^2-r^2)) for r<Rb; 0 otherwise
    bz = exp(-y^2/(Zb^2-y^2)) for |y|<Zb; 0 otherwise

The initial meridional velocity comes from a Stokes streamfunction

    S = (a/2) r^2 y br bz, with a=0.35.
    ur = -(1/r) d_y S
    uy =  (1/r) d_r S

The initial swirl is

    utheta = 0.85*r*exp(-r^2/2)*br*bz.

A selectable strength multiplier is applied to the entire initial velocity. The velocity is divergence-free analytically at initialisation and smoothly vanishes outside the compact support. The subsequent gas evolution does not enforce incompressibility. Initially rho=1 and theta=1. This unbalanced initial pressure is intentional and produces pressure readjustment; it is not an equilibrium or an incompressible control case. Density, temperature and velocities have no hidden random perturbations.

The initial tracer is a deterministically patterned annular sheet and helical near-axis marker, confined using br*bz. It affects no momentum or energy equation. The exact formula is in `solver.js`.

## Finite external forcing

The optional acceleration has the same compact meridional geometry, but with a=1 in the streamfunction, and a swirl coefficient of 0.70. It is multiplied by `1.2*strength*sin(pi*t/1.4)^2` for `0<t<1.4`, and zero otherwise. The amplitude is bounded; no target velocity or target collapsing length is imposed. Force work is integrated explicitly alongside the state.

The temporal pulse is C1 at its endpoints, not claimed C-infinity. This is a specified finite forcing for the analogue, **not** the smooth force constructed in the manuscript. The default dimensional acceleration unit c0^2/L0 is approximately 1.21e9 m/s^2. This is an idealised short-time microflow, not a calibrated apparatus or a claim that the source is easy to realise experimentally.

## Numerical algorithm

The solver uses a full 3D uniform Cartesian mesh, rather than an axisymmetric reduction. State is stored in GPU RGBA32F textures arranged as an atlas. The two physical textures contain:

    A = [rho, rho ux, rho uy, rho uz]
    B = [E, rho C, accumulated force work, accumulated viscous-heating diagnostic]

The last two B entries are local time integrals and have no advection flux. They are not physical sources applied again to E.

At each face:

1. Reconstruct primitive variables using a monotonised-central limiter, dimension by dimension.
2. Evaluate a local Lax–Friedrichs/Rusanov conservative flux, with wave-speed bound `max(|un|+c)` on reconstructed left/right states.
3. Subtract Newtonian viscous momentum flux and viscous-work/Fourier heat flux. Normal gradients use adjacent cell differences; transverse gradients are the average of centred gradients on both face neighbours. Transport coefficients are evaluated at the face-average temperature.

The divergence uses shared face expressions and periodic indices. Time integration is two-stage SSP Runge–Kutta. The second-order claim is for the method in smooth resolved regions; it is not an assertion of second-order accuracy at discontinuities or every limiter activation.

A GPU reduction estimates

    rate = (|ux|+|uy|+|uz|+3c)/dx
           + 6 max(4 mu_hat/(3 rho), kappa_hat/(rho Cv_hat))/dx^2
    dt = 0.30 / max(rate)
    Cv_hat = 1/[gamma(gamma-1)].

Both intermediate and final RK states are checked for positive density and pressure, finite values and an updated rate bound. Failed steps are discarded and retried at half dt, up to eight attempts. The prior accepted state remains untouched. Repeated failure stops the run. There is no speed clipping, temperature saturation or density-floor correction of accepted physical fields. Safe denominators used while detecting invalid states do not replace the acceptance check.

The optical texture is derived separately from the physical state. Its half-precision values affect only rendering. Every physics update still uses full single precision.

## Conservation and output

Because the boundaries are periodic, the correct global balance is

    total energy(t) - total energy(0) - integrated force work(t) = 0.

There is no claimed radiative/acoustic energy loss to an open environment. Heat flux redistributes energy internally. Pressure waves can wrap around the periodic domain; the box must not be interpreted as infinite open space.

UI residuals are relative to initial total mass and initial total energy. CSV fields `energy`, `kinetic`, `work` and `dissipation` are dimensionless volume integrals. Multiply by `rho0*c0^2*L0^3` for joules. Mass integrals are multiplied by `rho0*L0^3` for kilograms. `pMin` is in Pa, temperatures are in K, `rhoMin/rhoMax` are normalised densities, `t_us` is microseconds, `dt_ns` is nanoseconds.

## Model-window warnings and stops

The following are conservative **implementation guards**, not universal material transitions:

- Pause if any computed temperature leaves 200–600 K.
- Pause if `rhoMax * Tmax/T0 * p0`, a conservative pressure upper-bound estimate, exceeds 1 MPa.
- Pause if estimated resolved-gradient Kn exceeds 0.02.

The Knudsen diagnostic uses

    lambda ~= (mu/p) sqrt(pi R T/2)
    Kn_est = (lambda/L0) max(1, |grad rho|/rho,
                            |grad theta|/theta, ||grad u||F/c)

with dimensionless gradients. Definitions of molecular mean free path vary slightly. This warning is a viscosity-based estimate, not a Boltzmann/DSMC calculation. Unresolved gradients can make the diagnostic underestimate breakdown. The chosen 0.02 guard is not the same as a universal published critical Knudsen value.

A paused state does not mean real matter stops moving. Outside the chosen window, further simulation needs justified extended material physics and numerical resolution. No automatic switching to imaginary plasma, fusion or gravitational-collapse effects occurs.

## Rendering and performance

Volumetric tracer absorption/scattering and studio lighting provide a readable fluid view. The floor is staging, not a mechanical boundary. Fine procedural shading is a rendering choice, not additional resolved fluid structure. It is explicitly labelled in the viewport and can be disabled with Tracer appearance -> Raw computed envelope; it does not alter physics or diagnostics. No prescribed microtexture motion is used. Temperature, density and pressure modes are false-colour diagnostics, not predicted radiation.

The app requests a high-performance WebGL2 context, but the browser chooses the actual device. A renderer string is shown; detected software renderers are identified explicitly. This does not claim a verified P3200 benchmark. Mesh size is changed only by the explicit physics-grid selector. Adaptive optics reduces render resolution, not the physics mesh. Updates/s and FPS measure the running browser work; tab hiding and pause halt the numerical evolution.

## Verification

See `validation.json` for recorded results, version hashes and limitations. Tests include a separately implemented double-precision NumPy spatial operator, preservation of uniform flow, finite-speed acoustic propagation and refinement, viscous-shear decay, total-energy balance, heat-conduction cross-checks and browser interaction tests. These establish checks on the implemented numerical method, not experimental validation or the regularity of the exact PDE.

Grid dependence of the vortex is deliberately reported. A small global balance residual is not a licence to treat coarse-grid peaks as converged physical predictions.

## Sources for added physics

- NASA Glenn, compressible Navier–Stokes equations: https://www.grc.nasa.gov/www/BGH/nseqs.html
- NASA Glenn, speed of sound: https://www.grc.nasa.gov/www/BGH/sound.html
- NASA Glenn, calorically imperfect gas and limitations of constant heat capacities: https://www.grc.nasa.gov/www/BGH/realspec.html
- NASA PDS, gas constants: https://pds-atmospheres.nmsu.edu/education_and_outreach/encyclopedia/gas_constant.htm
- COMSOL CFD documentation, Sutherland coefficients for viscosity and conductivity: https://doc.comsol.com/6.3/doc/com.comsol.help.cfd/cfd_ug_fluidflow_high_mach.08.43.html
- Ketcheson, LeVeque and del Razo, Clawpack Riemann book, conservative Euler fluxes and positivity: https://www.clawpack.org/riemann_book/html/Euler_approximate.html
- NASA NTRS, continuum/DSMC comparison and gradient-length criterion: https://ntrs.nasa.gov/citations/20230013741
- COMSOL, viscosity-based mean-free-path convention and caveats: https://doc.comsol.com/6.3/doc/com.comsol.help.particle/particle_ug_fluid_flow.08.37.html
