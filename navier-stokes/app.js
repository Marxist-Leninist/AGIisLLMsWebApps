'use strict';
const $=id=>document.getElementById(id);
let solver=null,view=null,playing=false,lastFrame=performance.now(),fpsStart=performance.now(),frameCount=0,fps=0,ups=0,lastSteps=0,busy=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let cachedRecord=null;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function options(){return{n:Number($('grid').value),length:Number($('length').value),strength:Number($('strength').value),drive:$('drive').value==='1'};}
function init(auto=!reduced){
 playing=false;busy=true;$('limit-message').hidden=true;$('run-status').textContent='Initialising GPU';
 try{if(view)view.dispose();if(solver)solver.dispose();solver=new GasSolver($('fluid'),options());view=new GasView($('fluid'),solver);view.quality=$('quality').value;view.detail=$('texture').value==='1';view.view=Number(document.querySelector('[data-view].selected').dataset.view);view.render(true);$('render-error').hidden=true;
  playing=auto;cachedRecord=solver.records.at(-1);lastFrame=performance.now();fpsStart=lastFrame;frameCount=0;fps=0;ups=0;lastSteps=0;
  $('gpu-name').textContent=(solver.software?'SOFTWARE RENDERER DETECTED · ':'Graphics renderer: ')+solver.renderer;
  if(solver.software){view.quality='light';$('quality').value='light';toast('Software rendering detected here. Select the NVIDIA GPU in your browser for hardware acceleration.');}
 }catch(error){console.error(error);$('render-error').hidden=false;$('error-text').textContent=error.message;playing=false;solver=null;view=null;}
 busy=false;update();
}
function scientific(x){return Math.abs(x)<1e-12?'0':x.toExponential(1);}
function update(){
 const good=!!solver;['play','step','reset','snapshot','export-csv'].forEach(id=>$(id).disabled=!good||busy);
 if(!good){$('run-status').textContent='Renderer unavailable';return;}
 $('step').disabled=!!solver.stopped;
 const s=solver.stats,t=solver.time*solver.tunit*1e6,end=solver.endTime*solver.tunit*1e6,done=!!solver.stopped;
 $('time-value').innerHTML=t.toFixed(4)+'<span> µs</span>';$('dt-value').textContent=solver.lastDt?((solver.lastDt*solver.tunit*1e9).toFixed(2)+' ns / step'):'Adaptive CFL';
 $('mach-value').textContent=s.mach.toFixed(3);$('temp-value').innerHTML=s.Tmin.toFixed(0)+'–'+s.Tmax.toFixed(0)+'<span class="unit">K</span>';
 $('pressure-value').innerHTML=(s.pMin/1000).toFixed(1)+'<span class="unit">kPa</span>';
 $('density-value').innerHTML=s.rhoMin.toFixed(2)+'–'+s.rhoMax.toFixed(2)+'<span class="unit">×</span>';
 $('drive-label').textContent=!solver.drive?'Unforced relaxation':solver.time<1.4?'Finite stirring pulse active':'Stirring off · free evolution';
 $('scale-label').textContent=(solver.length*8*1e6).toFixed(0)+' µm periodic box · fixed world scale';
 $('end-time').textContent=end.toFixed(3)+' µs';$('progress').value=Math.min(1,solver.time/solver.endTime);
 $('step-count').textContent=solver.steps.toLocaleString()+' numerical steps';
 $('fps').textContent=playing?(fps?fps.toFixed(1)+' fps':'Measuring fps'):'Frame held';
 $('run-status').textContent=playing?'Solving in your browser':done?'Run paused at limit':'Paused';
 $('play-label').textContent=done?'Replay':playing?'Pause':'Play';$('play').setAttribute('aria-label',done?'Replay experiment':playing?'Pause simulation':'Play simulation');
 $('play-icon').innerHTML=playing?'<path d="M8 5v14M16 5v14"/>':'<path d="m8 5 10 7-10 7Z"/>';
 $('mass-error').textContent=scientific((s.mass-solver.initial.mass)/solver.initial.mass);
 $('energy-error').textContent=scientific((s.energy-solver.initial.energy-s.work)/solver.initial.energy);
 $('kn-value').textContent=s.kn.toFixed(4);
 $('compute-stats').textContent=solver.n+'³ cells · FP32 · '+(playing?ups.toFixed(1)+' updates/s':'updates held')+' · '+solver.retries+' rejected steps';
 const captions=[view.detail?'Computed tracer envelope · fine texture is illustrative':'Raw computed tracer envelope · not thermal emission','Diagnostic colour: blue below 300 K, amber above · not light emission','Diagnostic colour: blue below initial density, amber above','z = 0 pressure slice · colour relative to initial pressure'];$('field-caption').textContent=captions[view.view];
 const contrast=Math.max(s.rhoMax-1,1-s.rhoMin);
 if(solver.time===0){$('phase-title').innerHTML='A vortex that responds<br>to its own pressure.';$('phase-description').textContent='Density and temperature are computed, not prescribed.';}
 else if(!solver.drive){$('phase-title').innerHTML='Stirring is off.<br>The vortex relaxes.';$('phase-description').textContent='The initial vortex evolves through pressure, inertia and molecular transport.';}
 else if(solver.time<1.4){$('phase-title').innerHTML='Pressure waves.<br>Changing density.';$('phase-description').textContent='Finite stirring adds momentum and energy. The gas responds.';}
 else{$('phase-title').innerHTML='Stirring ends.<br>The flow keeps evolving.';$('phase-description').textContent='Pressure, inertia and molecular transport now shape the motion.';}
 let note='Finite-volume numerical diffusion remains. A finite answer is not proof that the paper’s singularity is regularised.';
 if(s.kn>.005)note='The resolved-gradient Knudsen estimate is increasing. These grid-scale diagnostics cannot verify molecular-scale behaviour.';
 if(solver.n===32)note='Coarse 32³ mesh: numerical broadening can dominate small structures. Compare with 64³ or 96³ before interpreting peaks.';
 if(solver.software)note='This browser reports software rendering. The solver is running on a software backend, not a physical NVIDIA GPU.';
 $('status-note').textContent=note;$('status-note').classList.toggle('warning',s.kn>.005||solver.n===32||solver.software);
 $('timeline-label').textContent=done?'Paused at the stated observation/model limit':playing?'Solving actual motion in slow motion':'Paused · step once or resume';
 $('limit-message').hidden=!done;
 if(done){let label,title,desc;
  if(solver.stopped==='window'){label='FINITE OBSERVATION WINDOW COMPLETE';title='The flow was not forced to infinity.';desc='This selected '+end.toFixed(3)+' µs experiment is complete. Gas motion would continue. This is not a proof about the paper’s exact singular solution.';}
  else if(solver.stopped==='temperature'){label='MATERIAL-MODEL GUARD';title='Outside the chosen 200–600 K window.';desc='The last accepted state is shown. Further evolution exceeds this implementation’s chosen validation window. Material properties and resolution must be reassessed before extending it. Temperature was not clipped.';}
  else if(solver.stopped==='kinetic'){label='CONTINUUM-MODEL GUARD';title='Molecular-scale effects need attention.';desc='The estimated gradient Knudsen number exceeded 0.02. This is a conservative software guard, not a kinetic calculation or proof of physical breakdown.';}
  else if(solver.stopped==='pressure'){label='MATERIAL-MODEL GUARD';title='Pressure estimate beyond this model window.';desc='The upper-bound pressure estimate exceeded 1 MPa. The run is paused instead of claiming the simple material model remains validated.';}
  else{label='NUMERICAL FAILURE';title='The next step was rejected.';desc='Repeated smaller timesteps did not produce a valid positive state. The previous accepted state is shown; this is not evidence of a physical singularity.';}
  $('limit-label').textContent=label;$('limit-title').textContent=title;$('limit-text').textContent=desc;
 }
 drawHistory();
}
function drawHistory(){if(!solver)return;const records=solver.records,highest=Math.max(1.5,...records.map(r=>r.mach)),height=48;
 let path='';records.forEach((r,i)=>{const x=r.t_us/(solver.endTime*solver.tunit*1e6)*270,y=59-r.mach/highest*height;path+=(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);});$('mach-line').setAttribute('d',path);$('chart-max').textContent=highest.toFixed(1);$('drive-end-line').style.display=solver.drive?'':'none';}
function toggle(){if(!solver)return;if(solver.stopped){init(true);return;}playing=!playing;fpsStart=performance.now();frameCount=0;lastSteps=solver.steps;update();}
$('play').addEventListener('click',toggle);$('reset').addEventListener('click',()=>init(true));$('replay').addEventListener('click',()=>init(true));
$('step').addEventListener('click',()=>{if(!solver||solver.stopped)return;playing=false;solver.step();solver.record();solver.makeOptical();view.dirty=true;view.render();update();});
['grid','length','strength','drive'].forEach(id=>$(id).addEventListener('change',()=>init(playing)));
$('texture').addEventListener('change',()=>{if(view){view.detail=$('texture').value==='1';view.dirty=true;}update();});
$('quality').addEventListener('change',()=>{if(view){view.quality=$('quality').value;view.dirty=true;}});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(v=>{const on=v===b;v.classList.toggle('selected',on);v.setAttribute('aria-pressed',String(on));});if(view){view.view=Number(b.dataset.view);view.dirty=true;}update();}));
let resumeNotes=false;function notes(){resumeNotes=playing;playing=false;$('sources').showModal();update();}
$('sources-open').addEventListener('click',notes);$('explain-open').addEventListener('click',notes);$('sources-close').addEventListener('click',()=>$('sources').close());$('sources').addEventListener('close',()=>{playing=resumeNotes&&!!solver&&!solver.stopped;update();});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|BUTTON|SELECT|TEXTAREA/.test(document.activeElement.tagName)&&!$('sources').open){e.preventDefault();toggle();}});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is restricted by this browser.');}});
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('export-csv').addEventListener('click',()=>{if(!solver)return;solver.record();const keys=Object.keys(solver.records.at(-1)).filter(k=>k!=='valid');const meta=['# Physical-air analogue; not the manuscript forcing','# n='+solver.n+', length_m='+solver.length+', strength='+solver.strength+', drive='+solver.drive,'# energy/kinetic/work/dissipation are dimensionless volume integrals; multiply by rho0*c0^2*Lref^3 to obtain joules','# pMin is Pa, T is K, density is rho/rho0; full boundaries and equations in METHODS.md'];let csv=meta.join('\n')+'\n'+keys.join(',')+'\n'+solver.records.map(r=>keys.map(k=>r[k]===undefined?'':r[k]).join(',')).join('\n');saveBlob(new Blob([csv],{type:'text/csv'}),'physical-air-data.csv');toast('Computed data saved, including work and conservation residuals.');});
$('snapshot').addEventListener('click',()=>{if(!solver||!view)return;view.render(true);const src=$('fluid'),c=document.createElement('canvas');c.width=src.width;c.height=src.height+100;const ctx=c.getContext('2d');ctx.fillStyle='#10171e';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(src,0,0);ctx.fillStyle='#d6e8df';ctx.font='15px sans-serif';ctx.fillText('Compressible air · '+(solver.time*solver.tunit*1e6).toFixed(4)+' µs · '+solver.n+'³',18,c.height-71);ctx.font='11px sans-serif';ctx.fillStyle='#b4c9cf';ctx.fillText('Peak Mach '+solver.stats.mach.toFixed(3)+' · T '+solver.stats.Tmin.toFixed(0)+'–'+solver.stats.Tmax.toFixed(0)+' K',18,c.height-49);ctx.fillText('Finite physical analogue, not the paper’s exact flow. Periodic boundaries.',18,c.height-29);ctx.fillText($('field-caption').textContent,18,c.height-12);c.toBlob(blob=>{if(blob)saveBlob(blob,'physical-air-view.png');});});
$('fluid').addEventListener('webglcontextlost',e=>{e.preventDefault();playing=false;busy=true;$('run-status').textContent='Graphics context lost';['play','step','reset'].forEach(id=>$(id).disabled=true);$('render-error').hidden=false;$('error-text').textContent='Graphics context lost. Reload to reinitialise; no state is fabricated.';});
window.gasLab={getState:()=>({playing,stats:solver?solver.stats:null,time:solver?solver.time:null,steps:solver?solver.steps:0,status:solver?solver.stopped:null,gpu:solver?solver.renderer:null,n:solver?solver.n:null,view:view?view.view:null}),get solver(){return solver;},get view(){return view;},pause:()=>{playing=false;update();},runSteps:n=>{playing=false;for(let i=0;i<n;i++){if(!solver.step())break;}solver.record();solver.makeOptical();view.dirty=true;view.render();update();return gasLab.getState();}};
function frame(now){
 if(solver&&view&&!busy&&!document.hidden){let before=view.frames;
  if(playing){const num=Number($('substeps').value);for(let i=0;i<num;i++){if(!solver.step())break;}solver.record();solver.makeOptical();view.dirty=true;if(solver.stopped)playing=false;}
  view.render();frameCount+=view.frames-before;
  if(now-fpsStart>1500){fps=frameCount*1000/(now-fpsStart);ups=(solver.steps-lastSteps)*1000/(now-fpsStart);if(view.quality==='adaptive'&&playing){if(fps<20)view.pixelBudget=Math.max(145000,view.pixelBudget*.75);else if(fps>50)view.pixelBudget=Math.min(700000,view.pixelBudget*1.08);}fpsStart=now;frameCount=0;lastSteps=solver.steps;}
  update();
 }
 lastFrame=now;requestAnimationFrame(frame);
}
// A real render/compute loop is started only after floating-point setup succeeds.
init();requestAnimationFrame(frame);
