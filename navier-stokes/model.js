/* Normalised explanatory model, not an instantiation of the manuscript's E,U profiles. */
const H = 0.006, TAU0 = 0.1, TAUMIN = 1e-7;
const SMAX = Math.log(TAU0 / TAUMIN);
function scales(s, analogue=false) {
  const q = Math.max(0,Math.min(SMAX,s));
  return {tau:TAU0*Math.exp(-q), t:1-TAU0*Math.exp(-q),
    radius:analogue?1:Math.exp(-.5*q), axial:analogue?1:Math.exp(-(.5-H)*q),
    speed:analogue?1:Math.exp((.5+H)*q), energy:analogue?1:Math.exp(-(.5-3*H)*q),
    reynolds:analogue?1:Math.exp(H*q)};
}
// Axisymmetric physical velocity, in units of the reference radius and time.
// S = a/2 * (lr^2*lz/tauRatio) * rho^2*(eta+b)*exp(-c*rho^2-d*eta^2).
// ur = -S_z/r, uz = S_r/r. The swirl is axisymmetric, so div(u)=0 exactly.
function velocity(x,y,z,s=0,analogue=false){
  const sc=scales(s,analogue), r=Math.hypot(x,z), rho=r/sc.radius, eta=y/sc.axial;
  const rr=rho*rho, e=Math.exp(-.16*rr-.08*eta*eta), ratio=Math.exp(-s);
  let ur,uz,ut;
  if(analogue){ur=-.65*r;uz=1.3*y;ut=r<1e-9?0:5*(1-Math.exp(-r*r))/r;}
  else{
    ur=sc.radius/ratio*(-1.5*rho*(1-.16*eta*(eta+.025))*e);
    uz=sc.axial/ratio*(3*(eta+.025)*(1-.16*rr)*e);
    ut=rho<1e-9?0:sc.speed*5*(1-Math.exp(-rr))/rho*Math.exp(-.025*eta*eta);
  }
  return r<1e-12?[0,uz,0]:[ur*x/r-ut*z/r,uz,ur*z/r+ut*x/r];
}
// Exact elementary integral of the reference envelope (7.12), illustrative lambda0=1,u*=2,Ls=24.
function pulse(v){
  const L=24,u=2, y=u*(.5+Math.max(0,Math.min(1,v)));
  return Math.exp(L/u*(Math.asinh(y)-Math.asinh(u)-((y+y*y*y/3)-(u+u*u*u/3))/Math.pow(1+u*u,1.5)));
}
