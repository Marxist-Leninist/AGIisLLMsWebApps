'use strict';
class GasView {
 constructor(canvas,solver){this.canvas=canvas;this.solver=solver;this.g=solver.gl;this.yaw=.45;this.pitch=.16;this.distance=14.;this.view=0;this.detail=true;this.quality='adaptive';this.pixelBudget=350000;this.dirty=true;this.frames=0;
  this.pr=solver.program(GasSolver.vertex,`#version 300 es
 precision highp float;precision highp int;
 uniform sampler2D field;uniform int N,tiles,viewMode;uniform vec2 atlasSize,resolution;uniform vec3 eye,side,up,forward;uniform float steps,detailOn;
 out vec4 colour;
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 vec2 atlasUV(vec2 p,float k){return (vec2(mod(k,float(tiles)),floor(k/float(tiles)))*float(N)+p+.5)/atlasSize;}
 vec4 sampleField(vec3 p){if(any(greaterThan(abs(p),vec3(4))))return vec4(0,1,1,0);vec3 c=clamp((p/8.+.5)*float(N)-.5,vec3(0),vec3(float(N)-1.));float k=floor(c.z);return mix(texture(field,atlasUV(c.xy,k)),texture(field,atlasUV(c.xy,min(k+1.,float(N)-1.))),fract(c.z));}
 vec2 boxHit(vec3 o,vec3 d){vec3 m=1./d,n=m*o,k=abs(m)*4.;vec3 a=-n-k,b=-n+k;return vec2(max(max(a.x,a.y),a.z),min(min(b.x,b.y),b.z));}
 vec3 tone(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 vec3 background(vec3 ro,vec3 rd){vec3 c=vec3(.005,.009,.014);c+=vec3(.013,.021,.024)*pow(max(0.,dot(rd,normalize(vec3(-.4,.8,-.5)))),12.);
  if(rd.y<-.01){float t=(-4.3-ro.y)/rd.y;if(t>0.){vec3 p=ro+rd*t;float fade=exp(-.012*t);vec3 floorColour=vec3(.02,.027,.032);float b=noise3(vec3(p.x*8.,p.z*70.,1.))-.5;floorColour+=b*.003;floorColour+=vec3(.03,.055,.052)*exp(-.06*dot(p.xz,p.xz));float line=exp(-pow((length(p.xz)-3.4)/.014,2.));floorColour+=line*vec3(.009,.014,.019);c=mix(c,floorColour,fade);}}return c;}
 float opacitySignal(vec4 v,vec3 p){if(viewMode==0){
 float r=length(p.xz),a=atan(p.z,p.x),th=a-p.y*1.2;
 vec3 q=vec3(r*cos(th),p.y,r*sin(th));
 float n=.65*noise3(q*7.5)+.35*noise3(q*19.5+vec3(7,3,4));
 float detail=smoothstep(.25,.76,n);
 float fibres=pow(.5+.5*sin(7.*a+10.*log(r+.16)+p.y*3.),6.);
 float grain=(.025+4.2*detail*detail)*mix(.32+1.8*fibres,1.,smoothstep(.3,1.8,abs(p.y)));
 return v.x*3.2*mix(1.,grain,detailOn);
 }
 if(viewMode==1)return abs(v.y-1.)*6.+v.x*.20;
 if(viewMode==2)return abs(v.z-1.)*5.+v.x*.1;
 return exp(-p.z*p.z/0.0064)*4.;}
 vec3 diagnostic(float x){float f=clamp(abs(x)*3.5,0.,1.);return x>0.?mix(vec3(.7,.72,.68),vec3(.95,.44,.12),f):mix(vec3(.7,.72,.68),vec3(.17,.44,.85),f);}
 void main(){vec2 xy=(gl_FragCoord.xy-.5*resolution)/resolution.y;vec3 rd=normalize(forward*1.65+side*xy.x+up*xy.y);vec3 col=background(eye,rd);vec2 hit=boxHit(eye,rd);
  if(hit.y>max(0.,hit.x)){float start=max(0.,hit.x),ds=(hit.y-start)/steps,t=start+ds*hash(vec3(gl_FragCoord.xy,1.));float tr=1.;vec3 sum=vec3(0),ld=normalize(vec3(-.55,.60,.40));
   for(int i=0;i<168;i++){if(float(i)>=steps||tr<.009)break;vec3 p=eye+rd*t;vec4 v=sampleField(p);float den=opacitySignal(v,p);float fade=1.-smoothstep(3.55,4.,max(max(abs(p.x),abs(p.y)),abs(p.z)));den*=fade;
    if(den>.001){float a=1.-exp(-den*ds*1.5);vec3 tint;
     if(viewMode==0){float shadow=sampleField(p+ld*.22).x*.35+sampleField(p+ld*.55).x*.45;float lighting=exp(-shadow*4.);vec3 lit=vec3(.25,.34,.41)+lighting*mix(vec3(.64,1.02,1.12),vec3(1.27,1.02,.64),smoothstep(-2.,2.5,p.y)*.60);tint=mix(vec3(.34,.58,.59),vec3(.73,.82,.77),clamp(v.x*3.,0.,1.))*lit;}
     else if(viewMode==1)tint=diagnostic(v.y-1.);
     else if(viewMode==2)tint=diagnostic(v.z-1.);
     else {float pressure=v.z*v.y;tint=diagnostic(pressure-1.);float grid=step(.97,fract((p.x+4.)*2.))+step(.97,fract((p.y+4.)*2.));tint*=1.-.09*min(1.,grid);}
     sum+=tr*a*tint;tr*=1.-a;
    }t+=ds;
   }col=sum+col*tr;
  }
  col*=max(.60,1.-.22*dot(xy,xy));colour=vec4(pow(tone(col*.95),vec3(1./2.2)),1.);
 }`);
  this.bindEvents();this.resize();
 }
 resize(){const r=this.canvas.getBoundingClientRect(),budget=this.quality==='high'?1000000:this.quality==='light'?145000:this.pixelBudget;const scale=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,r.width*r.height)));let w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.dirty=true;}}
 bindEvents(){this.events=new AbortController();const opt={signal:this.events.signal};let drag=false,last=[0,0];this.canvas.addEventListener('pointerdown',e=>{drag=true;last=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);},opt);this.canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw-=(e.clientX-last[0])*.005;this.pitch=Math.max(-.75,Math.min(.9,this.pitch+(e.clientY-last[1])*.004));last=[e.clientX,e.clientY];this.dirty=true;},opt);this.canvas.addEventListener('pointerup',()=>drag=false,opt);this.canvas.addEventListener('pointercancel',()=>drag=false,opt);this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(7.5,Math.min(20,this.distance*Math.exp(e.deltaY*.0007)));this.dirty=true;},{signal:this.events.signal,passive:false});this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.canvas);}
 render(force=false){this.resize();if(!this.dirty&&!force)return;this.dirty=false;const s=this.solver,g=this.g,p=this.pr;const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);s.use(p,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.drawBuffers([g.BACK]);s.texture(p,'field',s.optical.textures[0],0);s.uniform(p,'N','i',s.n);s.uniform(p,'tiles','i',s.tiles);s.uniform(p,'viewMode','i',this.view);s.uniform(p,'atlasSize','2f',[s.w,s.h]);s.uniform(p,'resolution','2f',[this.canvas.width,this.canvas.height]);s.uniform(p,'eye','3f',[sy*cp*this.distance,sp*this.distance,cy*cp*this.distance]);s.uniform(p,'side','3f',[cy,0,-sy]);s.uniform(p,'up','3f',[-sy*sp,cp,-cy*sp]);s.uniform(p,'forward','3f',[-sy*cp,-sp,-cy*cp]);s.uniform(p,'detailOn','f',this.detail?1:0);s.uniform(p,'steps','f',this.quality==='high'?160:this.quality==='light'?64:100);g.drawArrays(g.TRIANGLES,0,3);this.frames++;}
 dispose(){this.events.abort();this.observer.disconnect();}
}
window.GasView=GasView;
