'use strict';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={s:0,playing:!reduced,mode:'approach',speed:1,last:performance.now(),frames:0,fpsLast:performance.now(),fps:0,analogueTime:0};
let renderer=null;
try{renderer=new VortexRenderer($('fluid'));}catch(error){console.error('Vortex renderer:',error.message);$('render-error').hidden=false;state.playing=false;$('run-status').textContent='Renderer unavailable';$('snapshot').disabled=true;}
const superDigits={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
function sci(v){const e=Math.floor(Math.log10(v)+1e-10);return (v/Math.pow(10,e)).toFixed(2)+' × 10'+String(e).split('').map(c=>superDigits[c]).join('');}
function metric(v){if(v>=100)return v.toFixed(0);if(v>=10)return v.toFixed(1);if(v>=1)return v.toFixed(2);return v.toFixed(3);}
function activeButtons(attr,value){document.querySelectorAll('button['+attr+']').forEach(b=>{const on=b.getAttribute(attr)===value;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3200);}
function update(){
 const analog=state.mode==='analogue',sc=scales(state.s,analog),atEnd=!analog&&state.s>=SMAX-1e-8;
 $('time-label').textContent=analog?'STEADY BURGERS VORTEX':'MODEL TIME · DIMENSIONLESS';
 $('time-value').innerHTML=analog?'Steady<span> / no blowup</span>':sc.t.toFixed(7)+'<span> / 1</span>';
 $('tau-value').textContent=analog?'Not applicable':sci(sc.tau);
 $('radius-value').innerHTML=metric(sc.radius)+'<span>×</span>';$('speed-value').innerHTML=metric(sc.speed)+'<span>×</span>';$('energy-value').innerHTML=metric(sc.energy)+'<span>×</span>';
 $('radius-law').textContent=analog?'Viscous core held fixed':'∝ τ¹ᐟ²';$('speed-law').textContent=analog?'Steady velocity field':'∝ τ⁻⁽¹ᐟ²⁺ʰ⁾';$('energy-law').textContent=analog?'Fixed observation region':'∝ τ¹ᐟ²⁻³ʰ';
 $('metric-note').innerHTML=analog?'Normalised steady-flow reference.<br>No singularity is assigned to this analogue.':'Relative asymptotic scales; reference t = 0.9.<br>Not measurements of a full Navier–Stokes solve.';
 $('limit-message').hidden=!atEnd;
 $('play-label').textContent=atEnd?'Replay':state.playing?'Pause':'Play';$('play').setAttribute('aria-label',atEnd?'Replay simulation':state.playing?'Pause simulation':'Play simulation');
 $('play-icon').innerHTML=state.playing?'<path d="M8 5v14M16 5v14"/>':'<path d="m8 5 10 7-10 7Z"/>';
 $('run-status').textContent=!renderer?'Renderer unavailable':state.playing?'Live in your browser':atEnd?'At display limit':'Paused';
 $('timeline').disabled=analog;$('timeline').value=String(state.s/SMAX*1000);$('timeline').style.setProperty('--progress',state.s/SMAX*100+'%');
 $('timeline-label').textContent=analog?'Steady reference · time-to-singularity disabled':atEnd?'Display limit reached · τ = 10⁻⁷':'Approaching the singular time';
 document.querySelectorAll('[data-seek]').forEach(b=>b.disabled=analog);
 $('mode-label').textContent=analog?'CLOSEST PHYSICAL ANALOGUE':'MANUSCRIPT-GUIDED VISUAL MODEL';
 if(analog){$('phase-title').innerHTML='A strained vortex.<br>A finite, steady core.';$('phase-description').textContent='Stretching and viscosity balance in this steady reference.';$('story-heading').textContent='BURGERS VORTEX';$('story-text').textContent='A laboratory analogue: rotation with inward radial flow and two-sided axial withdrawal. Viscous diffusion balances stretching, keeping its core finite. This is not a laboratory realisation of the singularity.';}
 else{
  if(state.s<3.2){$('phase-title').innerHTML='Inward spiral.<br>Outward along the axis.';$('phase-description').textContent='Watch the region of intense flow concentrate.';}
  else if(state.s<8){$('phase-title').innerHTML='Smaller core.<br>Greater speed.';$('phase-description').textContent='The camera follows the shrinking flow region.';}
  else{$('phase-title').innerHTML='Closer to the limit.<br>Still before t = 1.';$('phase-description').textContent='Increasing speed does not mean increasing total energy.';}
  if(renderer&&!renderer.follow)$('phase-description').textContent='Fixed world scale: the observation region really is shrinking.';
  $('story-heading').textContent=state.s>7?'SPEED UP, CORE ENERGY DOWN':'THE MECHANISM';
  $('story-text').textContent=state.s>7?'The core speed rises while its volume falls even faster, so its energy scale decreases. This is concentration in a smaller region—not a physical explosion or a simulated infinite velocity.':'Fluid spirals inward and is carried away above and below the centre. The intense-flow region shrinks; a material parcel is not being squeezed into a point.';
 }
 const mag=renderer&&renderer.follow?1/sc.radius:1;
 const zoom=renderer?13.2/renderer.distance:1;
 $('scale-label').textContent=renderer&&renderer.follow?'Core-follow scale ×'+(mag*zoom<10?(mag*zoom).toFixed(1):(mag*zoom).toFixed(0)):'Fixed scale · relative radius '+metric(sc.radius)+'×';
 $('pulses').disabled=analog;$('pulse-chart').style.opacity=analog?'.25':'1';
 $('fps').textContent=!renderer?'GPU unavailable':state.playing?(state.fps>0?(state.fps<10?state.fps.toFixed(1):state.fps.toFixed(0))+' fps':'Measuring fps'):'Frame held';
 $('render-detail').textContent='64³ GPU dye advection · '+(renderer&&renderer.follow?'magnified core':'fixed world scale');
 const phase=renderer?(renderer.time*.10)%1:0,v=pulse(phase);$('pulse-cursor').setAttribute('x1',String(phase*260));$('pulse-cursor').setAttribute('x2',String(phase*260));$('pulse-dot').setAttribute('cx',String(phase*260));$('pulse-dot').setAttribute('cy',String(57-v*50));
}
let path='';for(let i=0;i<=150;i++)path+=(i?'L':'M')+(i/150*260).toFixed(2)+','+(57-pulse(i/150)*50).toFixed(2);$('pulse-curve').setAttribute('d',path);
function restart(){state.s=0;state.analogueTime=0;state.playing=!!renderer;if(renderer){renderer.s=0;renderer.reset();}update();}
function togglePlay(){if(!renderer)return;state.fpsLast=performance.now();state.frames=0;state.fps=0;if(state.mode==='approach'&&state.s>=SMAX)restart();else{state.playing=!state.playing;update();}}
$('play').addEventListener('click',togglePlay);$('reset').addEventListener('click',restart);$('replay-limit').addEventListener('click',restart);
function seek(value){if(state.mode==='analogue')return;state.s=Math.max(0,Math.min(1,value))*SMAX;state.playing=false;if(renderer){renderer.s=state.s;renderer.reset();}update();}
$('timeline').addEventListener('input',e=>seek(Number(e.target.value)/1000));document.querySelectorAll('[data-seek]').forEach(b=>b.addEventListener('click',()=>seek(Number(b.dataset.seek))));
// Time and numerical integration pause together; orbiting the frozen volume remains available.
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|SELECT|BUTTON|TEXTAREA/.test(document.activeElement.tagName)&&!$('sources').open){e.preventDefault();togglePlay();}});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{if(renderer){renderer.follow=b.dataset.camera==='follow';renderer.dirty=true;}activeButtons('data-camera',b.dataset.camera);update();}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;activeButtons('data-mode',state.mode);if(renderer){renderer.analogue=state.mode==='analogue';renderer.reset();}if(state.mode==='approach'&&state.s>=SMAX)state.playing=false;else state.playing=!!renderer;update();}));
$('pulses').addEventListener('change',e=>{if(renderer){renderer.pulses=e.target.checked;renderer.dirty=true;}});$('playback').addEventListener('change',e=>state.speed=Number(e.target.value));$('quality').addEventListener('change',e=>{if(renderer){renderer.quality=e.target.value;renderer.dirty=true;renderer.resize();}});
function openNotes(){state.resumeAfterNotes=state.playing;state.playing=false;$('sources').showModal();update();}
$('sources-open').addEventListener('click',openNotes);$('explain-open').addEventListener('click',openNotes);$('sources-close').addEventListener('click',()=>$('sources').close());$('sources').addEventListener('close',()=>{state.playing=state.resumeAfterNotes&&!!renderer;update();});$('sources').addEventListener('click',e=>{if(e.target===$('sources')){const r=$('sources').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('sources').close();}});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not enabled in this browser.');}});
$('snapshot').addEventListener('click',()=>{if(!renderer)return;renderer.render(true);const c=document.createElement('canvas');c.width=renderer.canvas.width;c.height=renderer.canvas.height+90;const ctx=c.getContext('2d');ctx.fillStyle='#10171e';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(renderer.canvas,0,0);ctx.fillStyle='#d4e7df';ctx.font='16px sans-serif';ctx.fillText('Navier–Stokes · '+(state.mode==='analogue'?'Burgers reference':'t = '+scales(state.s).t.toFixed(7)),20,c.height-56);ctx.fillStyle='#9baeb9';ctx.font='11px sans-serif';ctx.fillText('Reduced visual model · prescribed flow, not a full Navier–Stokes solution',20,c.height-34);ctx.fillText((renderer.follow?'Core-follow magnification':'Fixed world scale')+' · h = 0.006 (illustrative)',20,c.height-16);c.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='navier-stokes-view.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('View saved with model and time labels.');},'image/png');});
$('fluid').addEventListener('webglcontextlost',e=>{e.preventDefault();state.playing=false;$('run-status').textContent='Graphics context lost';$('render-error').hidden=false;});
// Testable diagnostics distinguish evaluated ratios from GPU transport and rendering.
window.vortex={getState:()=>({...state,scales:scales(state.s,state.mode==='analogue'),renderer:renderer?{frames:renderer.frames,simSteps:renderer.simSteps,float:renderer.float,follow:renderer.follow,grid:64,width:renderer.canvas.width,height:renderer.canvas.height}:null}),seek,scales,velocity,pulse};
update();let uiLast=0;
function frame(now){const elapsed=Math.min((now-state.last)/1000,.065);state.last=now;
 if(!document.hidden&&renderer){
  if(state.playing){const ds=elapsed*SMAX/80*state.speed;if(state.mode==='approach'){const actual=Math.min(ds,SMAX-state.s);state.s+=actual;renderer.s=state.s;renderer.step(actual);if(state.s>=SMAX-1e-10){state.s=SMAX;state.playing=false;}}
   else{state.analogueTime+=ds;renderer.step(ds);}}
  const priorFrames=renderer.frames;renderer.render();state.frames+=renderer.frames-priorFrames;
  if(now-state.fpsLast>1250&&state.frames>0){state.fps=state.frames*1000/(now-state.fpsLast);if(renderer.quality==='auto'&&state.frames>0){if(state.fps<24&&renderer.pixelBudget>125000)renderer.pixelBudget=Math.max(125000,renderer.pixelBudget*.65);else if(state.fps>52&&renderer.pixelBudget<700000)renderer.pixelBudget=Math.min(700000,renderer.pixelBudget*1.07);}state.fpsLast=now;state.frames=0;}
 }
 if(now-uiLast>100){update();uiLast=now;}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
