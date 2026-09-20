'use strict';
// GPU advection of a passive visual tracer. This is intentionally NOT a Navier–Stokes momentum solver.
class VortexRenderer {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('WebGL 2 unavailable');
  const gl=this.gl;this.float=!!gl.getExtension('EXT_color_buffer_float');
  this.s=0;this.analogue=false;this.follow=true;this.pulses=true;this.time=0;this.quality='auto';this.pixelBudget=360000;
  this.yaw=.48;this.pitch=.20;this.distance=13.2;this.frames=0;this.simSteps=0;this.dirty=true;
  const vs=`#version 300 es
  precision highp float; out vec2 uv; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
  const common=`
  precision highp float;
  uniform sampler2D field;
  const float N=64.; const float T=8.; const float W=512.; const float BOX=3.;
  float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  vec2 atlasUV(vec2 c,float k){return (vec2(mod(k,T),floor(k/T))*N+c+.5)/W;}
  vec4 sampleField(vec3 p){
   if(any(greaterThan(abs(p),vec3(BOX))))return vec4(0);
   vec3 c=clamp((p/(BOX*2.)+.5)*N-.5,vec3(0),vec3(N-1.));
   float k=floor(c.z);return mix(texture(field,atlasUV(c.xy,k)),texture(field,atlasUV(c.xy,min(k+1.,N-1.))),fract(c.z));
  }
  `;
  const sf=`#version 300 es
  ${common}
  uniform float dt,clockTime,concentration,h;uniform bool resetField,analogue;in vec2 uv;out vec4 frag;
  vec3 flow(vec3 p){
   float r2=dot(p.xz,p.xz),r=sqrt(r2),sw=5.*(1.-exp(-r2))/max(r2,1e-6);
   if(analogue)return vec3(-.65*p.x-sw*p.z,1.3*p.y,-.65*p.z+sw*p.x);
   float e=exp(-.16*r2-.08*p.y*p.y),rad=-1.5*(1.-.16*p.y*(p.y+.025))*e;
   float axial=3.*(p.y+.025)*(1.-.16*r2)*e;
   sw*=exp(h*concentration-.025*p.y*p.y);
   // Coordinate drift is necessary: p is a shrinking observation window, not material coordinates.
   return vec3((rad+.5)*p.x-sw*p.z,axial+(.5-h)*p.y,(rad+.5)*p.z+sw*p.x);
  }
  vec4 seed(vec3 p){
   float r=length(p.xz),a=atan(p.z,p.x),y=p.y;
   float structure=.35+.65*noise3(p*9.+vec3(3,9,1));
   float spiral=pow(.5+.5*sin(6.*a+8.*log(r+.12)+y*4.),7.);
   float mid=exp(-y*y*30.)*exp(-pow((r-1.25)/.9,2.))*(.20+.7*spiral);
   float jets=exp(-pow((r-(.19+.018*y*y))/.23,2.))*(.45+.55*pow(.5+.5*sin(3.*a-y*7.),3.))*exp(-.13*y*y);
   float core=.12*exp(-r*r*7.-y*y*.22);
   float d=(mid+.9*jets+core)*structure;
   return vec4(d*(.75+.25*sin(a)),d*(.67-.24*sin(a)),0.,1.);
  }
  void main(){
   vec2 pc=gl_FragCoord.xy-.5;float k=floor(pc.x/N)+T*floor(pc.y/N);
   vec3 p=(vec3(mod(pc.x,N),mod(pc.y,N),k)+.5)/N*6.-3.;
   if(resetField){frag=seed(p);return;}
   vec3 m=p-.5*dt*flow(p), back=p-dt*flow(m);
   vec4 v=sampleField(back);v.xy*=exp(-dt*.10);
   float r=length(p.xz),a=atan(p.z,p.x),phase=clockTime*.28;
   float injection=exp(-pow((r-1.97)/.16,2.)-pow(p.y/.065,2.));
   float filament=.06+.94*pow(.5+.5*sin(a*9.+phase+noise3(p*11.)*1.6),10.);
   v.xy+=dt*9.*injection*filament*vec2(.75+.25*cos(a*2.+phase),.65-.25*cos(a*2.+phase));
   // A tiny continuously seeded near-axis tracer makes axial transport visible.
   float central=exp(-r*r*11.-pow((p.y+.04)/.10,2.));
   v.xy+=dt*.45*central;
   frag=vec4(clamp(v.xy,0.,4.),0.,1.);
  }`;
  const rf=`#version 300 es
  ${common}
  uniform vec2 resolution;uniform vec3 eye,side,up,forward,volumeScale;
  uniform float clockTime,concentration,quality,pulseValue;uniform bool pulses,analogue;
  in vec2 uv;out vec4 frag;
  vec3 tone(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
  vec2 intersectBox(vec3 o,vec3 d){vec3 m=1./d,n=m*o,k=abs(m)*3.;vec3 t1=-n-k,t2=-n+k;return vec2(max(max(t1.x,t1.y),t1.z),min(min(t2.x,t2.y),t2.z));}
  vec3 room(vec3 ro,vec3 rd){
   vec3 c=vec3(.004,.008,.013)*(1.+.4*rd.y);
   float soft=pow(max(0.,dot(rd,normalize(vec3(-.4,.8,-.5)))),18.);
   c+=vec3(.028,.043,.044)*soft;
   if(rd.y<-.015){float t=(-3.62-ro.y)/rd.y;if(t>0.){
    vec3 p=ro+rd*t;float fall=exp(-.036*dot(p.xz,p.xz));
    float brush=(noise3(vec3(p.x*4.,p.z*110.,0.))-.5)*.003;
    c=vec3(.017,.025,.030)+brush;
    float caustic=exp(-pow(p.x/1.6,2.)-pow((p.z+.0)/1.4,2.));
    c+=vec3(.033,.09,.088)*caustic;
    float ring=exp(-pow((length(p.xz)-2.65)/.018,2.));
    c+=ring*vec3(.018,.026,.029)*fall;
    float panel=exp(-pow((p.x+4.)/.27,2.))*exp(-pow((p.z+1.)/4.,2.));
    c+=vec3(.085,.068,.042)*panel*fall;
    c=mix(vec3(.004,.008,.013),c,exp(-.015*t));
   }}
   return c;
  }
  vec2 density(vec3 p){
   vec2 d=sampleField(p).xy;
   float r=length(p.xz),a=atan(p.z,p.x);
   float th=a-clockTime*3.8/(1.+r*r)-p.y*1.15;
   vec3 w=vec3(r*cos(th),p.y,r*sin(th));
   float n=noise3(w*7.5+vec3(0,clockTime*.11,0));
   float n2=noise3(w*19.5+vec3(7,3,4));
   float fibres=pow(.5+.5*sin(7.*a+11.*log(r+.15)-clockTime*5./(1.+r*r)+2.*p.y),6.);
   float detail=smoothstep(.22,.79,.65*n+.35*n2);
   d*= (.06+2.6*detail*detail)*mix(.55+1.2*fibres,1.,smoothstep(.3,1.8,abs(p.y)));
   float edge=1.-smoothstep(2.55,3.,max(max(abs(p.x),abs(p.y)),abs(p.z)));
   return d*edge;
  }
  float overlay(vec3 p){
   float r=length(p.xz),a=atan(p.z,p.x),outv=0.;
   for(int j=0;j<4;j++){
    float jf=float(j), y=(jf-1.5)*.86;
    float phase=fract(clockTime*.10+jf*.27),yref=2.*(.5+phase),amp=exp(12.*(asinh(yref)-asinh(2.)-((yref+yref*yref*yref/3.)-(2.+8./3.))/pow(5.,1.5)));
    float rad=1.02+jf*.105,ring=exp(-pow((r-rad)/.035,2.)-pow((p.y-y)/.05,2.));
    float pattern=.40+.60*pow(.5+.5*cos((12.+floor(concentration*.4))*a+clockTime*(j%2==0?1.:-1.)),2.);
    outv+=ring*amp*pattern;
   }return outv;
  }
  void main(){
   vec2 xy=(gl_FragCoord.xy-.5*resolution)/resolution.y;
   vec3 rd=normalize(forward*1.65+side*xy.x+up*xy.y);
   vec3 col=room(eye,rd),o=eye/volumeScale,d=rd/volumeScale;
   vec2 hit=intersectBox(o,d);
   if(hit.y>max(hit.x,0.)){
    float a=max(0.,hit.x),b=hit.y;
    float steps=quality;float stepSize=(b-a)/steps;
    float rayFactor=length(d)*stepSize;
    float jitter=hash(vec3(gl_FragCoord.xy,1.));
    float travel=a+stepSize*jitter,trans=1.;vec3 result=vec3(0);
    vec3 lightDir=normalize(vec3(-.65,.65,.42));
    for(int i=0;i<144;i++){
     if(float(i)>=steps||trans<.012)break;
     vec3 p=o+d*travel;vec2 dyes=density(p);float den=(dyes.x+dyes.y)*.60;
     if(den>.002){
      float shadow=0.;shadow+=(sampleField(p+lightDir*.16).x+sampleField(p+lightDir*.16).y)*.15;
      shadow+=(sampleField(p+lightDir*.43).x+sampleField(p+lightDir*.43).y)*.18;
      float illumination=exp(-shadow*2.8);
      float viewAngle=pow(max(0.,dot(rd,-lightDir)),5.);
      vec3 tint=mix(vec3(.33,.56,.57),vec3(.66,.76,.71),clamp(den*1.5,0.,1.));
      float warmth=smoothstep(-1.,2.,p.y)*.40;
      vec3 lighting=vec3(.19,.29,.36)+illumination*mix(vec3(.72,.94,1.12),vec3(1.45,1.04,.60),warmth);
      lighting+=viewAngle*vec3(.40,.55,.53)*illumination;
      float alpha=1.-exp(-den*rayFactor*1.7);
      result+=trans*alpha*tint*lighting;trans*=1.-alpha;
     }
     if(pulses&&!analogue){float wave=overlay(p);float alpha=1.-exp(-wave*rayFactor*.60);result+=trans*alpha*vec3(.67,.43,.19);trans*=1.-alpha;}
     travel+=stepSize;
    }
    col=result+col*trans;
   }
   // A quiet photographic vignette and fine sensor grain; no fake emissive explosion.
   float vignette=1.-.24*dot(xy,xy);col*=max(.55,vignette);
   col=pow(tone(col*1.18),vec3(1./2.2));
   col+=(hash(vec3(gl_FragCoord.xy,clockTime*.03))-.5)/430.;
   frag=vec4(col,1);
  }`;
  this.sim=this.program(vs,sf);this.renderProgram=this.program(vs,rf);
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  this.fields=[this.makeTarget(),this.makeTarget()];this.current=0;this.resize();this.reset();this.bindEvents();
 }
 program(vs,fs){const g=this.gl;function shader(t,s){const sh=g.createShader(t);g.shaderSource(sh,s);g.compileShader(sh);if(!g.getShaderParameter(sh,g.COMPILE_STATUS)){const e=g.getShaderInfoLog(sh);g.deleteShader(sh);throw Error(e);}return sh;}
  const v=shader(g.VERTEX_SHADER,vs),f=shader(g.FRAGMENT_SHADER,fs),p=g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return{p,loc:{}};
 }
 uni(pr,n,type,value){const g=this.gl;let l=pr.loc[n];if(l===undefined)l=pr.loc[n]=g.getUniformLocation(pr.p,n);if(l===null)return;if(type==='1f')g.uniform1f(l,value);else if(type==='1i')g.uniform1i(l,value);else if(type==='2f')g.uniform2fv(l,value);else if(type==='3f')g.uniform3fv(l,value);}
 makeTarget(){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texImage2D(g.TEXTURE_2D,0,this.float?g.RGBA16F:g.RGBA8,512,512,0,g.RGBA,this.float?g.HALF_FLOAT:g.UNSIGNED_BYTE,null);const f=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,t,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Dye framebuffer is not supported');g.bindFramebuffer(g.FRAMEBUFFER,null);return{t,f};}
 reset(){this.time=0;this.advect(0,true);this.render();}
 advect(dt,reset=false){const g=this.gl,p=this.sim;g.useProgram(p.p);g.bindVertexArray(this.vao);g.bindFramebuffer(g.FRAMEBUFFER,this.fields[1-this.current].f);g.viewport(0,0,512,512);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.fields[this.current].t);this.uni(p,'field','1i',0);this.uni(p,'dt','1f',dt);this.uni(p,'clockTime','1f',this.time);this.uni(p,'concentration','1f',this.s);this.uni(p,'h','1f',H);this.uni(p,'resetField','1i',reset?1:0);this.uni(p,'analogue','1i',this.analogue?1:0);g.drawArrays(g.TRIANGLES,0,3);this.current=1-this.current;this.simSteps++;this.dirty=true;}
 resize(){const r=this.canvas.getBoundingClientRect();const budget=this.quality==='high'?980000:this.quality==='low'?185000:this.pixelBudget;const scale=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(budget/Math.max(1,r.width*r.height)));const w=Math.max(1,Math.round(r.width*scale)),h=Math.max(1,Math.round(r.height*scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.dirty=true;}}
 bindEvents(){let drag=false,prev=[0,0];this.canvas.addEventListener('pointerdown',e=>{drag=true;prev=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);this.dirty=true;});this.canvas.addEventListener('pointermove',e=>{if(!drag)return;this.yaw-=(e.clientX-prev[0])*.005;this.pitch=Math.max(-.7,Math.min(.9,this.pitch+(e.clientY-prev[1])*.004));prev=[e.clientX,e.clientY];this.dirty=true;});const end=()=>drag=false;this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',end);this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=Math.max(6.4,Math.min(17,this.distance*Math.exp(e.deltaY*.00065)));this.dirty=true;},{passive:false});new ResizeObserver(()=>this.resize()).observe(this.canvas);}
 render(force=false){this.resize();if(!force&&!this.dirty)return;this.dirty=false;const g=this.gl,p=this.renderProgram,cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);const eye=[sy*cp*this.distance,sp*this.distance,cy*cp*this.distance],forward=[-sy*cp,-sp,-cy*cp],side=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp];
  const sc=scales(this.s,this.analogue),rad=this.follow?1:sc.radius,ax=this.follow?sc.axial/sc.radius:sc.axial;
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.useProgram(p.p);g.bindVertexArray(this.vao);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.fields[this.current].t);
  const u=(n,t,v)=>this.uni(p,n,t,v);u('field','1i',0);u('resolution','2f',[this.canvas.width,this.canvas.height]);u('eye','3f',eye);u('side','3f',side);u('up','3f',up);u('forward','3f',forward);u('volumeScale','3f',[rad*.88,ax*1.05,rad*.88]);u('clockTime','1f',this.time);u('concentration','1f',this.s);u('quality','1f',this.quality==='high'?128:this.quality==='low'?56:80);u('pulses','1i',this.pulses?1:0);u('analogue','1i',this.analogue?1:0);g.drawArrays(g.TRIANGLES,0,3);this.frames++;
 }
 step(dt){this.time+=dt;this.advect(dt);}
}
