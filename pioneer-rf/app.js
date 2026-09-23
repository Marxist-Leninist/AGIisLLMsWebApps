import {PIONEER,SLOPES,clamp,linkBudget,generateWaterfall,classicalPredict,frameReward} from "./physics.js";
import {RFTransformerPolicy} from "./transformer.js";

const $=id=>document.getElementById(id);
const ui={};
[
  "modelStatus","runStatus","spaceCanvas","waterfall","history","distanceLabel","lightTimeLabel",
  "cn0","rxPower","capacity","ber","classicLock","classicDrift","classicReward","classicEMA",
  "neuralLock","neuralDrift","neuralReward","neuralEMA","entropy","rlSteps","benchNN","benchClassic",
  "benchCleanNN","benchCleanClassic","benchVerdict","apClassical","apNeural","apSaving","apDetectClean","apDetectRfi","apRedesign","apFrequencyNote","distance","dish","elements","temp","bandwidth",
  "rfi","lr","oDistance","oDish","oElements","oTemp","oBw","oRfi","oLr","runBtn","domainBtn",
  "resetBtn","online","eqAperture","massRatio","coherentTime","rtt","ebn0","shannon","rxMode","txMode",
  "modeCopy","packetBits","packetState"
].forEach(k=>ui[k]=$(k));

const state={
  running:false, policy:null, frame:0, targetClass:6, nnEMA:0, classicalEMA:0,
  historyNN:[], historyCL:[], lastWF:null, lastLink:null, mode:"rx", domainPulse:0,
  nextClassAt:48
};

const stars=Array.from({length:150},(_,i)=>{
  const r=mulberry32(1000+i);
  return {x:r(),y:r(),a:.18+r()*.62,s:.35+r()*1.35};
});
function mulberry32(a){return()=>{let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}

function fmtSec(s){
  if(s<1)return (s*1000).toFixed(1)+" ms";
  if(s<120)return s.toFixed(1)+" s";
  return (s/60).toFixed(1)+" min";
}
function fmtCap(v){return v<100?v.toFixed(1):v<1000?v.toFixed(0):(v/1000).toFixed(2)+"k"}
function fmtBer(v){if(v<1e-6)return "<1e-6"; if(v<.001)return v.toExponential(1); return v.toFixed(3)}
function driftText(a){const s=SLOPES[a];return (s>=0?"+":"")+s.toFixed(3)+" bin/frame"}

function readParams(){
  const p={
    distanceAU:+ui.distance.value,dishM:+ui.dish.value,elements:+ui.elements.value,
    systemTempK:+ui.temp.value,bandwidthHz:+ui.bandwidth.value,bitRate:8
  };
  const l=linkBudget(p);
  ui.oDistance.value=p.distanceAU.toFixed(2)+" AU";
  ui.oDish.value=p.dishM.toFixed(2)+" m";
  ui.oElements.value=String(p.elements);
  ui.oTemp.value=p.systemTempK.toFixed(0)+" K";
  ui.oBw.value=p.bandwidthHz.toFixed(0)+" Hz";
  ui.oRfi.value=Math.round(+ui.rfi.value*100)+"%";
  ui.oLr.value=(+ui.lr.value).toFixed(3);
  ui.distanceLabel.textContent=p.distanceAU.toFixed(3);
  ui.lightTimeLabel.textContent=l.lightTimeSec.toFixed(1);
  ui.cn0.textContent=l.cn0DbHz.toFixed(1);
  ui.rxPower.textContent=l.pRxDbm.toFixed(1);
  ui.capacity.textContent=fmtCap(l.capacityBps);
  ui.ber.textContent=fmtBer(l.ber);
  ui.eqAperture.textContent=l.equivalentDiameterM.toFixed(1)+" m";
  ui.massRatio.textContent=(100*l.arrayMassRatioToEquivalentSingle).toFixed(0)+"%";
  ui.coherentTime.textContent=fmtSec(l.coherentSecFor10dB);
  ui.rtt.textContent=fmtSec(l.roundTripSec);
  ui.ebn0.textContent=l.ebn0Db.toFixed(1)+" dB";
  ui.shannon.textContent=fmtCap(l.capacityBps)+" bit/s";
  state.lastLink=l;
  return {p,l};
}

function tick(){
  if(!state.policy)return;
  const {l}=readParams();
  state.frame++;
  if(state.frame>=state.nextClassAt){
    const jump=(Math.floor(Math.random()*5)-2);
    state.targetClass=clamp(state.targetClass+jump,0,SLOPES.length-1);
    state.nextClassAt=state.frame+36+Math.floor(Math.random()*42);
  }
  const rfi=clamp(+ui.rfi.value+state.domainPulse,0,1);
  state.domainPulse*=0.985;
  const wf=generateWaterfall({
    slopeClass:state.targetClass,
    signalSnrDb:clamp(l.snrBandwidthDb,-7,4),
    rfiLevel:rfi,burstLevel:0.35+0.5*rfi
  });
  state.lastWF=wf;

  const cl=classicalPredict(wf.norm);
  state.policy.lr=+ui.lr.value;
  state.policy.trainOnline=ui.online.checked;
  const nn=state.policy.act(wf.norm,{sample:ui.online.checked,temperature:ui.online.checked?.72:.35});
  const rc=frameReward(cl.action,state.targetClass,l.cn0DbHz,rfi);
  const rn=frameReward(nn.action,state.targetClass,l.cn0DbHz,rfi);
  const upd=state.policy.reinforce(nn,rn.reward,+ui.lr.value);

  state.classicalEMA=state.frame===1?rc.success:.96*state.classicalEMA+.04*rc.success;
  state.nnEMA=state.frame===1?rn.success:.96*state.nnEMA+.04*rn.success;
  state.historyCL.push(state.classicalEMA);
  state.historyNN.push(state.nnEMA);
  if(state.historyCL.length>180){state.historyCL.shift();state.historyNN.shift()}

  ui.classicDrift.textContent=driftText(cl.action);
  ui.neuralDrift.textContent=driftText(nn.action);
  ui.classicReward.textContent=rc.reward.toFixed(3);
  ui.neuralReward.textContent=rn.reward.toFixed(3);
  ui.classicEMA.textContent=(100*state.classicalEMA).toFixed(1)+"%";
  ui.neuralEMA.textContent=(100*state.nnEMA).toFixed(1)+"%";
  ui.entropy.textContent=nn.entropy.toFixed(3)+" nat";
  ui.rlSteps.textContent=String(upd.steps);
  ui.classicLock.textContent=rc.success>.6?"LOCK":"SEARCH";
  ui.neuralLock.textContent=rn.success>.6?(ui.online.checked?"LEARN+LOCK":"LOCK"):"TRAIN";
  ui.packetState.textContent=rn.success>.62?(state.mode==="rx"?"FRAME / PARITY LOCK":"LOOPBACK ACK"):"NO LOCK";
  ui.packetState.style.color=rn.success>.62?"var(--green)":"var(--amber)";
  if(state.frame%7===0){
    ui.packetBits.textContent=Array.from({length:3},()=>Math.floor(Math.random()*256).toString(2).padStart(8,"0")).join(" ");
  }
  drawWaterfall(wf.raw);
  drawHistory();
}

function drawWaterfall(raw){
  const c=ui.waterfall,ctx=c.getContext("2d"), W=c.width,H=c.height;
  const cw=W/raw[0].length,ch=H/raw.length;
  const vals=raw.flat().map(v=>Math.log1p(v));
  vals.sort((a,b)=>a-b);
  const lo=vals[Math.floor(vals.length*.08)], hi=vals[Math.floor(vals.length*.985)];
  ctx.fillStyle="#020508";ctx.fillRect(0,0,W,H);
  for(let t=0;t<raw.length;t++)for(let f=0;f<raw[t].length;f++){
    const q=clamp((Math.log1p(raw[t][f])-lo)/(hi-lo+1e-6),0,1);
    const hue=210-190*Math.pow(q,.8);
    const sat=50+45*q, light=4+62*Math.pow(q,1.45);
    ctx.fillStyle="hsl("+hue+" "+sat+"% "+light+"%)";
    ctx.fillRect(f*cw,t*ch,cw+.6,ch+.6);
  }
  ctx.strokeStyle="rgba(160,220,240,.18)";ctx.lineWidth=1;
  for(let f=0;f<=16;f+=4){ctx.beginPath();ctx.moveTo(f*cw,0);ctx.lineTo(f*cw,H);ctx.stroke()}
  ctx.fillStyle="rgba(220,240,250,.58)";ctx.font="11px ui-monospace,monospace";
  ctx.fillText("time ↓",8,16);ctx.fillText("frequency offset →",W-145,H-10);
}

function drawHistory(){
  const c=ui.history,ctx=c.getContext("2d"),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#071017";ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="rgba(130,170,190,.13)";ctx.lineWidth=1;
  for(let y=0;y<=4;y++){ctx.beginPath();ctx.moveTo(0,y*h/4);ctx.lineTo(w,y*h/4);ctx.stroke()}
  function line(arr,stroke){
    if(arr.length<2)return;ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.beginPath();
    arr.forEach((v,i)=>{const x=i/(Math.max(1,arr.length-1))*w,y=h-(v*h*.92+8);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  }
  line(state.historyCL,"rgba(255,202,106,.86)");
  line(state.historyNN,"rgba(81,230,255,.95)");
  ctx.fillStyle="#8297a5";ctx.font="11px ui-monospace,monospace";ctx.fillText("lock-quality EMA · amber classical / cyan RL transformer",10,18);
}

function drawScene(now){
  const c=ui.spaceCanvas,ctx=c.getContext("2d"),w=c.width,h=c.height,t=now/1000;
  ctx.fillStyle="#020407";ctx.fillRect(0,0,w,h);
  for(const s of stars){ctx.globalAlpha=s.a*(.8+.2*Math.sin(t*.5+s.x*20));ctx.fillStyle="#d8ecff";ctx.fillRect(s.x*w,s.y*h,s.s,s.s)}
  ctx.globalAlpha=1;

  // Sun glow.
  const sunX=-80,sunY=h*.27;
  let g=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,260);
  g.addColorStop(0,"rgba(255,247,190,1)");g.addColorStop(.16,"rgba(255,197,91,.88)");g.addColorStop(.48,"rgba(255,119,35,.18)");g.addColorStop(1,"rgba(255,90,20,0)");
  ctx.fillStyle=g;ctx.fillRect(0,0,350,h*.72);

  // Earth.
  const ex=w*.22,ey=h*.58,er=Math.min(w,h)*.11;
  g=ctx.createRadialGradient(ex-er*.35,ey-er*.35,er*.08,ex,ey,er);
  g.addColorStop(0,"#9dd8ff");g.addColorStop(.35,"#297cc1");g.addColorStop(.73,"#123c75");g.addColorStop(1,"#030b18");
  ctx.shadowColor="#4aa7ff";ctx.shadowBlur=28;ctx.fillStyle=g;ctx.beginPath();ctx.arc(ex,ey,er,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle="rgba(72,130,88,.72)";
  for(const [ox,oy,rx,ry] of [[-.25,-.15,.34,.17],[.18,.12,.28,.13],[-.05,.34,.16,.10]]){ctx.beginPath();ctx.ellipse(ex+ox*er,ey+oy*er,rx*er,ry*er,.3,0,Math.PI*2);ctx.fill()}
  ctx.strokeStyle="rgba(150,220,255,.52)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(ex,ey,er+3,0,Math.PI*2);ctx.stroke();

  // Radio path + moving wavefront packets.
  const sx=w*.76,sy=h*.38;
  const beam=ctx.createLinearGradient(ex,ey,sx,sy);beam.addColorStop(0,"rgba(80,225,255,.03)");beam.addColorStop(.5,"rgba(80,225,255,.28)");beam.addColorStop(1,"rgba(80,225,255,.05)");
  ctx.strokeStyle=beam;ctx.lineWidth=1.4;ctx.setLineDash([8,12]);ctx.beginPath();ctx.moveTo(ex+er,ey-er*.3);ctx.lineTo(sx,sy);ctx.stroke();ctx.setLineDash([]);
  for(let i=0;i<7;i++){const u=(t*.16+i/7)%1,x=ex+(sx-ex)*u,y=ey+(sy-ey)*u;ctx.globalAlpha=.3+.7*Math.sin(Math.PI*u);ctx.strokeStyle="#65efff";ctx.beginPath();ctx.arc(x,y,5+u*10,0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=1;

  // Stylised Pioneer 6, with real 60 rpm spin represented by one visual turn per second.
  ctx.save();ctx.translate(sx,sy);ctx.rotate(t*2*Math.PI*PIONEER.spinRpm/60);
  const bodyGrad=ctx.createLinearGradient(-54,0,54,0);bodyGrad.addColorStop(0,"#4b2417");bodyGrad.addColorStop(.25,"#b97040");bodyGrad.addColorStop(.52,"#d99a64");bodyGrad.addColorStop(.8,"#6e321d");bodyGrad.addColorStop(1,"#25120e");
  ctx.fillStyle=bodyGrad;ctx.strokeStyle="#c78859";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,58,34,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="rgba(255,190,130,.42)";ctx.lineWidth=1;for(let x=-45;x<=45;x+=15){ctx.beginPath();ctx.moveTo(x,-27);ctx.lineTo(x,27);ctx.stroke()}
  ctx.strokeStyle="#b9c7ca";ctx.lineWidth=3;for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){ctx.beginPath();ctx.moveTo(Math.cos(a)*48,Math.sin(a)*25);ctx.lineTo(Math.cos(a)*112,Math.sin(a)*64);ctx.stroke()}
  ctx.fillStyle="#c9d1ce";ctx.beginPath();ctx.ellipse(0,0,20,10,0,0,Math.PI*2);ctx.fill();
  ctx.restore();

  // Ground dish silhouette.
  const dx=w*.10,dy=h*.86;
  ctx.strokeStyle="#91a7af";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(dx,dy+48);ctx.lineTo(dx+24,dy);ctx.lineTo(dx+48,dy+48);ctx.stroke();
  ctx.strokeStyle="#b4c9cf";ctx.lineWidth=2;ctx.beginPath();ctx.arc(dx+24,dy-3,35,.18*Math.PI,.82*Math.PI);ctx.stroke();ctx.beginPath();ctx.moveTo(dx+24,dy-3);ctx.lineTo(dx+35,dy-40);ctx.stroke();

  ctx.fillStyle="rgba(215,235,242,.72)";ctx.font="12px ui-monospace,monospace";
  ctx.fillText("EARTH ARRAY",dx-18,dy+68);ctx.fillText("PIONEER 6 · 62.14 kg · 60 rpm",sx-100,sy+78);
  requestAnimationFrame(drawScene);
}

function installControls(){
  ["distance","dish","elements","temp","bandwidth","rfi","lr"].forEach(id=>ui[id].addEventListener("input",()=>{readParams(); if(!state.running && state.policy)tick()}));
  ui.runBtn.addEventListener("click",()=>{
    state.running=!state.running;ui.runBtn.textContent=state.running?"Pause live pass":"Start live pass";
    ui.runStatus.classList.toggle("hot",state.running);ui.runStatus.innerHTML=state.running?"<i></i> live simulation + online training":"<i></i> simulation paused";
  });
  ui.resetBtn.addEventListener("click",()=>{state.policy?.resetOnline();state.historyNN=[];state.nnEMA=0;ui.rlSteps.textContent="0"});
  ui.domainBtn.addEventListener("click",()=>{state.domainPulse=.35;state.targetClass=Math.floor(Math.random()*SLOPES.length);state.nextClassAt=state.frame+55});
  ui.online.addEventListener("change",()=>{if(state.policy)state.policy.trainOnline=ui.online.checked});
  ui.rxMode.addEventListener("click",()=>setMode("rx"));ui.txMode.addEventListener("click",()=>setMode("tx"));
}
function setMode(mode){
  state.mode=mode;ui.rxMode.classList.toggle("selected",mode==="rx");ui.txMode.classList.toggle("selected",mode==="tx");
  ui.modeCopy.textContent=mode==="rx"
    ?"Receiver compares blind classical search with the learned policy on the same simulated RF frame."
    :"Synthetic loopback sends a generic training frame through the reciprocal link and rewards the policy when the simulated receiver obtains a stable frame/CRC lock. No spacecraft command encoder is present.";
}

function showAperture(a){
  const f=a.fixed_50_50_whole_receiver;
  const d=a.detector;
  const h=a.hypothetical_waveform_redesign;
  ui.apClassical.textContent=f.classical.equivalent_dish_m.toFixed(2)+" m";
  ui.apNeural.textContent=f.neural.equivalent_dish_m.toFixed(2)+" m";
  ui.apSaving.textContent=f.diameter_saving_percent.toFixed(1)+"%";
  ui.apDetectClean.textContent=d.robust_classical.clean_cn0_dbhz.toFixed(2)+" / "+d.mixed_split_transformer_reference_50pct.clean_cn0_dbhz_interpolated.toFixed(2)+" dB-Hz";
  ui.apDetectRfi.textContent=d.robust_classical.rfi_cn0_dbhz.toFixed(2)+" / "+d.mixed_split_transformer_reference_50pct.rfi_cn0_dbhz_interpolated.toFixed(2)+" dB-Hz";
  ui.apRedesign.textContent=h.neural_measured.equivalent_dish_m.toFixed(2)+" m neural";
  ui.apFrequencyNote.textContent="Detector rows show classical / transformer. Aperture benchmark uses 0.26 AU, 120 K and 6 dBi. Pioneer 6 carrier frequency and onboard modulation split are fixed; the "+Math.round(h.neural_measured.carrier_fraction*100)+"% carrier result is a hypothetical radio-design study.";
}

function showBench(payload){
  const b=payload.benchmark;
  if(!b)return;
  const r=b.held_out_rfi,c=b.held_out_clean;
  ui.benchNN.textContent=(100*r.transformer_accuracy).toFixed(1)+"%";
  ui.benchClassic.textContent=(100*r.classical_accuracy).toFixed(1)+"%";
  ui.benchCleanNN.textContent=(100*c.transformer_accuracy).toFixed(1)+"%";
  ui.benchCleanClassic.textContent=(100*c.classical_accuracy).toFixed(1)+"%";
  const pass=r.transformer_accuracy>r.classical_accuracy;
  ui.benchVerdict.textContent=pass
    ?"ACCEPTED · learned receiver beats blind classical search in held-out structured RFI"
    :"REJECTED · classical still leads this checkpoint";
  ui.benchVerdict.className="verdict "+(pass?"pass":"fail");
  ui.modelStatus.className="pill "+(pass?"hot":"amber");
  ui.modelStatus.innerHTML=pass?"<i></i> trained checkpoint accepted":"<i></i> trained checkpoint below target";
}

async function init(){
  installControls();readParams();requestAnimationFrame(drawScene);
  try{
    state.policy=await RFTransformerPolicy.load("trained_weights.json");
    showBench(state.policy.payload);
    try{
      const ar=await fetch("aperture_benchmark.json",{cache:"no-store"});
      if(!ar.ok)throw new Error("aperture benchmark HTTP "+ar.status);
      showAperture(await ar.json());
    }catch(e){console.warn(e);ui.apFrequencyNote.textContent="aperture_benchmark.json unavailable";}
    tick();
  }catch(e){
    console.error(e);ui.modelStatus.className="pill amber";ui.modelStatus.innerHTML="<i></i> model load failed";
    ui.benchVerdict.textContent="trained_weights.json unavailable";
  }
  setInterval(()=>{if(state.running)tick()},220);
}
init();
