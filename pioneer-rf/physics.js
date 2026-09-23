// Physical layer for the Pioneer RF + learned receiver sandbox.
// Historical constants are labelled separately from adjustable assumptions.

export const C = 299792458;
export const K_B = 1.380649e-23;
export const AU = 149597870700;
export const PIONEER = Object.freeze({
  downlinkHz: 2292.0214e6, // historical Pioneer 6 channel value used in 1969-70 DSN docs
  txPowerW: 8,
  txGainDb: 11.2,
  massKg: 62.14,
  spinRpm: 60,
  bitRates: [8,16,64,256,512],
});

export const T = 24;
export const F = 16;
export const SLOPES = Array.from({length:9},(_,i)=>-0.24 + i*0.06);

export const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
export const db10 = x => 10*Math.log10(Math.max(x,1e-300));
export const undb10 = x => Math.pow(10,x/10);

export function dishGainLinear(diameterM, efficiency=0.58, freqHz=PIONEER.downlinkHz) {
  const lambda = C/freqHz;
  return efficiency*Math.pow(Math.PI*diameterM/lambda,2);
}

export function linkBudget({
  distanceAU=0.26, dishM=3, elements=1, efficiency=0.58,
  systemTempK=120, txPowerW=PIONEER.txPowerW,
  txGainDb=PIONEER.txGainDb, systemLossDb=2.0,
  bitRate=8, bandwidthHz=20
}={}) {
  const R = distanceAU*AU;
  const lambda = C/PIONEER.downlinkHz;
  const gt = undb10(txGainDb);
  const grOne = dishGainLinear(dishM,efficiency);
  const gr = grOne*Math.max(1,elements); // coherent array
  const fs = Math.pow(lambda/(4*Math.PI*R),2);
  const pRx = txPowerW*gt*gr*fs/undb10(systemLossDb);
  const n0 = K_B*systemTempK;
  const cn0 = db10(pRx/n0);
  const ebn0 = cn0-db10(bitRate);
  const snrBw = pRx/(n0*bandwidthHz);
  const capacity = bandwidthHz*Math.log2(1+snrBw);
  const lightTimeSec = R/C;
  // Nominal BPSK uncoded BER in AWGN.
  const ber = 0.5*erfcApprox(Math.sqrt(Math.max(0,undb10(ebn0))));
  // Rough coherent time to reach 10 dB integrated carrier SNR in 1 Hz after perfect de-drift.
  const coherentSecFor10dB = Math.max(1e-4,10/Math.max(1e-12,pRx/n0));
  const eqDiameter = dishM*Math.sqrt(Math.max(1,elements));
  // Generic D^2.7 structural mass scaling, normalized to one 3 m element.
  const singleMassUnits = Math.pow(eqDiameter/3,2.7);
  const arrayMassUnits = Math.max(1,elements)*Math.pow(dishM/3,2.7);
  return {
    distanceM:R, lambda, pRxW:pRx, pRxDbm:db10(pRx)+30,
    cn0DbHz:cn0, ebn0Db:ebn0, capacityBps:capacity, ber,
    lightTimeSec, roundTripSec:2*lightTimeSec, coherentSecFor10dB,
    receiveGainDb:db10(gr), equivalentDiameterM:eqDiameter,
    arrayMassRatioToEquivalentSingle:arrayMassUnits/singleMassUnits,
    bandwidthHz, snrBandwidthDb:db10(snrBw)
  };
}

function erfApprox(x) {
  // Abramowitz-Stegun 7.1.26.
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const p=0.3275911;
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429;
  const t=1/(1+p*x);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return s*y;
}
function erfcApprox(x){ return 1-erfApprox(x); }

function expNoise() {
  return -Math.log(Math.max(1e-9,1-Math.random()));
}
function gauss(x,mu,s){ const z=(x-mu)/s; return Math.exp(-0.5*z*z); }

export function generateWaterfall({
  slopeClass=4, signalSnrDb=-2, rfiLevel=0.7, burstLevel=0.45,
  targetF0=null
}={}) {
  const raw = Array.from({length:T},()=>Array.from({length:F},expNoise));
  const tc=(T-1)/2;
  const f0=targetF0 ?? (4+Math.random()*7);
  const slope=SLOPES[clamp(Math.round(slopeClass),0,SLOPES.length-1)];
  const signalPower=undb10(signalSnrDb)*7.5;
  for(let t=0;t<T;t++){
    const track=f0+slope*(t-tc);
    const pilot=[1.00,0.10,0.92,0.08,1.08,0.12][t%6];
    for(let f=0;f<F;f++) raw[t][f]+=signalPower*pilot*gauss(f,track,0.42);
  }

  if(Math.random()<rfiLevel){
    const lines = Math.random()<0.45 ? 2 : 1;
    for(let j=0;j<lines;j++){
      const rf=1+Math.random()*(F-3);
      const amp=3+Math.random()*9*rfiLevel;
      for(let t=0;t<T;t++) for(let f=0;f<F;f++) raw[t][f]+=amp*gauss(f,rf,0.32);
    }
  }

  // Same-grid moving decoy without the six-step target pilot signature.
  if(Math.random()<rfiLevel*0.9){
    let dc; do { dc=Math.floor(Math.random()*SLOPES.length); } while(Math.abs(dc-slopeClass)<2);
    const df0=4+Math.random()*7, ds=SLOPES[dc], damp=signalPower*(1.15+Math.random()*0.95);
    for(let t=0;t<T;t++){
      const rf=df0+ds*(t-tc);
      for(let f=0;f<F;f++) raw[t][f]+=damp*gauss(f,rf,0.40);
    }
  }

  if(Math.random()<rfiLevel*0.62){
    const rf0=3+Math.random()*9;
    const rs=-0.33+Math.random()*0.66;
    const amp=1.5+Math.random()*6.5*rfiLevel;
    for(let t=0;t<T;t++){
      const rf=rf0+rs*(t-tc);
      for(let f=0;f<F;f++) raw[t][f]+=amp*gauss(f,rf,0.38);
    }
  }
  if(Math.random()<burstLevel){
    const bursts=1+Math.floor(Math.random()*3);
    for(let j=0;j<bursts;j++){
      const tr=Math.floor(Math.random()*T);
      for(let f=0;f<F;f++) raw[tr][f]+=expNoise()*(3+Math.random()*7);
    }
  }

  const z=raw.flat().map(v=>Math.log1p(v));
  const med=median(z);
  const dev=z.map(v=>Math.abs(v-med));
  const mad=median(dev)+1e-3;
  const norm=Array.from({length:T},(_,t)=>Array.from({length:F},(_,f)=>
    clamp((Math.log1p(raw[t][f])-med)/(1.4826*mad),-4,8)
  ));
  return {raw,norm,f0,slope,slopeClass};
}

export function classicalPredict(norm) {
  // Same comparator as the Python benchmark: temporal-median RFI subtraction
  // followed by de-drift matched-energy search with burst winsorisation.
  const medFreq=Array.from({length:F},(_,f)=>median(norm.map(row=>row[f])));
  const r=norm.map(row=>row.map((v,f)=>v-medFreq[f]));
  const tc=(T-1)/2;
  let bestClass=0,best=-Infinity;
  for(let si=0;si<SLOPES.length;si++){
    const slope=SLOPES[si];
    let bestSlope=-Infinity;
    for(let f0=2;f0<F-2;f0+=0.5){
      const vals=[];
      for(let t=0;t<T;t++){
        const idx=clamp(Math.round(f0+slope*(t-tc)),0,F-1);
        vals.push(r[t][idx]);
      }
      const lim=quantile(vals,0.8);
      const score=vals.reduce((s,v)=>s+Math.min(v,lim),0);
      if(score>bestSlope) bestSlope=score;
    }
    if(bestSlope>best){best=bestSlope;bestClass=si;}
  }
  return {action:bestClass,score:best};
}

export function frameReward(action,targetClass,cn0DbHz,rfiLevel=0.5) {
  const err=Math.abs(action-targetClass);
  const coherence=Math.exp(-0.85*err*err);
  // Soft lock threshold. Reward is what a simulated CRC/parity/lock observer would
  // expose; the policy does not receive targetClass directly.
  const link=1/(1+Math.exp(-(cn0DbHz-7.5)/2.2));
  const rfiPenalty=1-0.22*rfiLevel;
  const success=clamp(coherence*link*rfiPenalty,0,1);
  const reward=0.08+0.92*success;
  return {reward,success,coherence};
}

export function median(a){
  const b=[...a].sort((x,y)=>x-y), n=b.length;
  return n%2?b[(n-1)/2]:0.5*(b[n/2-1]+b[n/2]);
}
export function quantile(a,q){
  const b=[...a].sort((x,y)=>x-y);
  const p=(b.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p);
  return b[lo]+(b[hi]-b[lo])*(p-lo);
}
