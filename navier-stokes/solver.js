'use strict';
// Compressible Navier–Stokes–Fourier in a periodic Cartesian box.
// Physical transport is separate from the Rusanov numerical dissipation.
const AIR = Object.freeze({gamma:1.4,R:287.05,T0:300,p0:101325,mu0:1.716e-5,muT0:273,muS:111,k0:.0241,kT0:273,kS:194});
const sutherland=(T,v0,Tref,S)=>v0*Math.pow(T/Tref,1.5)*(Tref+S)/(T+S);
class GasSolver {
 constructor(canvas,options={}) {
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('WebGL 2 is unavailable. Enable browser graphics acceleration.');
  const g=this.gl;
  if(!g.getExtension('EXT_color_buffer_float'))throw new Error('Floating-point render targets are required. No low-precision physics fallback is used.');
  this.linearFloat=!!g.getExtension('OES_texture_float_linear');
  const debug=g.getExtension('WEBGL_debug_renderer_info');
  this.renderer=debug?g.getParameter(debug.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);
  this.software=/swiftshader|llvmpipe|software|basic render/i.test(this.renderer);
  this.vao=g.createVertexArray();g.bindVertexArray(this.vao);
  this.n=options.n||64;this.tiles=Math.ceil(Math.sqrt(this.n));this.w=this.tiles*this.n;this.h=Math.ceil(this.n/this.tiles)*this.n;
  this.length=options.length||1e-4;this.strength=options.strength===undefined?1:options.strength;this.drive=options.drive===undefined?true:options.drive;
  this.transport=options.transport===undefined?true:options.transport;
  this.case=options.case||'vortex';this.order=options.order===undefined?2:options.order;
  this.rho0=AIR.p0/(AIR.R*AIR.T0);this.c0=Math.sqrt(AIR.gamma*AIR.R*AIR.T0);this.tunit=this.length/this.c0;
  this.dx=8/this.n;this.time=0;this.steps=0;this.retries=0;this.stopped='';this.endTime=options.endTime||2.5;this.records=[];this.maxSeen={mach:0,T:300};
  this.resources=[];this.programs=[];
  this.states=[this.target(this.w,this.h,2),this.target(this.w,this.h,2),this.target(this.w,this.h,2)];this.current=0;
  this.statTargets=[];let w=this.w,h=this.h;this.statTargets.push(this.target(w,h,4));while(w>1||h>1){w=Math.ceil(w/4);h=Math.ceil(h/4);this.statTargets.push(this.target(w,h,4));}
  this.optical=this.target(this.w,this.h,1,true);
  this.stepProgram=this.program(GasSolver.vertex,this.makeStepShader());
  this.statsProgram=this.program(GasSolver.vertex,this.makeStatsShader());
  this.reduceProgram=this.program(GasSolver.vertex,GasSolver.reduceShader);
  this.opticalProgram=this.program(GasSolver.vertex,this.makeOpticalShader());
  this.uploadInitial(options);this.measure();this.initial={...this.stats};this.record();this.makeOptical();
 }
 static vertex=`#version 300 es
 precision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
 common(){return `
 precision highp float;precision highp int;
 uniform sampler2D stateA,stateB;uniform int N,tiles;uniform float dx,Lref,transportOn;
 const float GAMMA=1.4, CV=1.7857142857142857;
 struct State {vec4 a;vec4 b;};
 struct Primitive {vec4 a;vec2 b;};
 ivec3 cell(){ivec2 q=ivec2(gl_FragCoord.xy);return ivec3(q.x%N,q.y%N,q.x/N+tiles*(q.y/N));}
 ivec2 atlas(ivec3 q){q=(q%N+N)%N;return ivec2((q.z%tiles)*N+q.x,(q.z/tiles)*N+q.y);}
 State load(ivec3 q){ivec2 a=atlas(q);return State(texelFetch(stateA,a,0),texelFetch(stateB,a,0));}
 Primitive primitive(State u){float rho=max(u.a.x,1e-15);vec3 v=u.a.yzw/rho;float p=(GAMMA-1.)*(u.b.x-.5*rho*dot(v,v));return Primitive(vec4(u.a.x,v),vec2(p,u.b.y/rho));}
 Primitive at(ivec3 q){return primitive(load(q));}
 float theta(Primitive p){return GAMMA*p.b.x/max(p.a.x,1e-15);}
 float visc(float temp){float T=300.*max(temp,1e-8);return transportOn*1.716e-5*pow(T/273.,1.5)*384./(T+111.)/(1.176624281484062*347.2189510957027*Lref);}
 float conductivity(float temp){float T=300.*max(temp,1e-8);return transportOn*.0241*pow(T/273.,1.5)*467./(T+194.)*300./(1.176624281484062*pow(347.2189510957027,3.)*Lref);}
 float sound(Primitive p){return sqrt(max(theta(p),1e-15));}
 State conserved(Primitive p){return State(vec4(p.a.x,p.a.x*p.a.yzw),vec4(p.b.x/(GAMMA-1.)+.5*p.a.x*dot(p.a.yzw,p.a.yzw),p.a.x*p.b.y,0,0));}
 State flux(Primitive p,int a){State u=conserved(p);float vn=p.a[a+1];vec4 f=u.a*vn;f[a+1]+=p.b.x;return State(f,vec4((u.b.x+p.b.x)*vn,u.b.y*vn,0,0));}
 vec3 forcing(vec3 p,float t,float amp){
  if(t<=0.||t>=1.4)return vec3(0);
  float r2=dot(p.xz,p.xz),z2=p.y*p.y,R2=7.84,Z2=9.61;
  if(r2>=R2||z2>=Z2)return vec3(0);
  float er=exp(-r2/(R2-r2)),ez=exp(-z2/(Z2-z2));
  float radial=-.5*(1.-2.*z2*Z2/pow(Z2-z2,2.))*er*ez;
  float axial=p.y*(1.-r2*R2/pow(R2-r2,2.))*er*ez;
  float swirl=.70*exp(-.5*r2)*er*ez;
  float pulse=pow(sin(3.14159265359*t/1.4),2.);
  return amp*pulse*vec3(radial*p.x-swirl*p.z,axial,radial*p.z+swirl*p.x);
 }
 `;}
 makeStepShader(){return `#version 300 es
 ${this.common()}
 uniform sampler2D baseA,baseB;uniform float dt,timeNow,driveAmp,blendBase;uniform int methodOrder;
 layout(location=0)out vec4 outA;layout(location=1)out vec4 outB;
 vec4 limited(vec4 dm,vec4 dp){return .5*(sign(dm)+sign(dp))*min(min(2.*abs(dm),2.*abs(dp)),.5*abs(dm+dp));}
 Primitive slope(Primitive l,Primitive c,Primitive r){return Primitive(limited(c.a-l.a,r.a-c.a),limited(vec4(c.b-l.b,0,0),vec4(r.b-c.b,0,0)).xy);}
 State face(ivec3 q,int axis){
  ivec3 e=ivec3(0);e[axis]=1;Primitive l=at(q),r=at(q+e),lf=l,rf=r;
  if(methodOrder==2){Primitive sl=slope(at(q-e),l,r),sr=slope(l,r,at(q+2*e));lf=Primitive(l.a+.5*sl.a,l.b+.5*sl.b);rf=Primitive(r.a-.5*sr.a,r.b-.5*sr.b);}
  State ul=conserved(lf),ur=conserved(rf),fl=flux(lf,axis),fr=flux(rf,axis);
  float speed=max(abs(lf.a[axis+1])+sound(lf),abs(rf.a[axis+1])+sound(rf));
  State f=State(.5*(fl.a+fr.a-speed*(ur.a-ul.a)),.5*(fl.b+fr.b-speed*(ur.b-ul.b)));
  if(transportOn>0.){
   mat3 grad;
   for(int b=0;b<3;b++){
    if(b==axis)grad[b]=(r.a.yzw-l.a.yzw)/dx;
    else {ivec3 eb=ivec3(0);eb[b]=1;grad[b]=(at(q+eb).a.yzw-at(q-eb).a.yzw+at(q+e+eb).a.yzw-at(q+e-eb).a.yzw)/ (4.*dx);}
   }
   float div=grad[0].x+grad[1].y+grad[2].z,temp=.5*(theta(l)+theta(r));
   vec3 stress=visc(temp)*(grad[axis]+vec3(grad[0][axis],grad[1][axis],grad[2][axis]));stress[axis]-=(2./3.)*visc(temp)*div;
   f.a.yzw-=stress;
   f.b.x-=dot(stress,.5*(l.a.yzw+r.a.yzw))+conductivity(temp)*(theta(r)-theta(l))/dx;
  }
  return f;
 }
 void main(){
  ivec3 q=cell();if(q.z>=N){outA=vec4(0);outB=vec4(0);return;}
  State u=load(q);vec4 da=vec4(0),db=vec4(0);
  for(int a=0;a<3;a++){ivec3 e=ivec3(0);e[a]=1;State plus=face(q,a),minus=face(q-e,a);da-=(plus.a-minus.a)/dx;db-=(plus.b-minus.b)/dx;}
  vec3 p=(vec3(q)+.5)*dx-4.;vec3 f=forcing(p,timeNow,driveAmp);
  da.yzw+=u.a.x*f;float work=dot(u.a.yzw,f);db.x+=work;db.z=work;
  if(transportOn>0.){
   mat3 grad;for(int a=0;a<3;a++){ivec3 e=ivec3(0);e[a]=1;grad[a]=(at(q+e).a.yzw-at(q-e).a.yzw)/(2.*dx);}
   float div=grad[0].x+grad[1].y+grad[2].z;mat3 strain=.5*(grad+transpose(grad));
   float norm2=dot(strain[0],strain[0])+dot(strain[1],strain[1])+dot(strain[2],strain[2]);
   db.w=2.*visc(theta(primitive(u)))*max(0.,norm2-div*div/3.);
  }
  ivec2 xy=ivec2(gl_FragCoord.xy);
  outA=mix(u.a+dt*da,texelFetch(baseA,xy,0),blendBase);
  outB=mix(u.b+dt*db,texelFetch(baseB,xy,0),blendBase);
 }
 `;}
 makeStatsShader(){return `#version 300 es
 ${this.common()}
 layout(location=0)out vec4 mx;layout(location=1)out vec4 sums;layout(location=2)out vec4 extras;layout(location=3)out vec4 mn;
 void main(){
  ivec3 q=cell();if(q.z>=N){mx=vec4(0);sums=vec4(0);extras=vec4(0);mn=vec4(1e30);return;}
  State u=load(q);Primitive p=primitive(u);float T=theta(p);
  bool bad=any(isnan(u.a))||any(isnan(u.b))||any(isinf(u.a))||any(isinf(u.b))||u.a.x<=0.||p.b.x<=0.;
  if(bad){mx=vec4(1e25);sums=vec4(0);extras=vec4(0,0,0,1);mn=vec4(-1);return;}
  float cs=sound(p),nu=visc(T)/u.a.x,alpha=conductivity(T)/(u.a.x*CV);
  float rate=(abs(p.a.y)+abs(p.a.z)+abs(p.a.w)+3.*cs)/dx+6.*max(4.*nu/3.,alpha)/(dx*dx);
  float mach=length(p.a.yzw)/cs;
  vec3 gradRho,gradT;float gradUNorm=0.;
  for(int a=0;a<3;a++){ivec3 e=ivec3(0);e[a]=1;Primitive l=at(q-e),r=at(q+e);gradRho[a]=(r.a.x-l.a.x)/(2.*dx);gradT[a]=(theta(r)-theta(l))/(2.*dx);vec3 v=(r.a.yzw-l.a.yzw)/(2.*dx);gradUNorm+=dot(v,v);}
  float physT=T*300.;float mu=1.716e-5*pow(physT/273.,1.5)*384./(physT+111.);
  float lambda=mu/(p.b.x*141855.)*sqrt(3.14159265359*287.05*physT/2.);
  float inverseScale=max(1.,max(length(gradRho)/u.a.x,max(length(gradT)/T,sqrt(gradUNorm)/cs)));
  mx=vec4(rate,mach,T,lambda/Lref*inverseScale);
  float kinetic=.5*dot(u.a.yzw,u.a.yzw)/u.a.x;
  sums=vec4(u.a.x,u.b.x,kinetic,u.b.z);extras=vec4(u.b.w,u.b.y,0,0);mn=vec4(u.a.x,T,p.b.x,-u.a.x);
 }
 `;}
 static reduceShader=`#version 300 es
 precision highp float;precision highp int;
 uniform sampler2D s0,s1,s2,s3;uniform ivec2 sourceSize;
 layout(location=0)out vec4 a;layout(location=1)out vec4 b;layout(location=2)out vec4 c;layout(location=3)out vec4 d;
 void main(){ivec2 origin=ivec2(gl_FragCoord.xy)*4;a=vec4(0);b=vec4(0);c=vec4(0);d=vec4(1e30);
 for(int j=0;j<4;j++)for(int i=0;i<4;i++){ivec2 p=origin+ivec2(i,j);if(any(greaterThanEqual(p,sourceSize)))continue;a=max(a,texelFetch(s0,p,0));b+=texelFetch(s1,p,0);c+=texelFetch(s2,p,0);d=min(d,texelFetch(s3,p,0));}}
 `;
 makeOpticalShader(){return `#version 300 es
 ${this.common()}
 layout(location=0)out vec4 frag;
 void main(){ivec3 q=cell();if(q.z>=N){frag=vec4(0);return;}Primitive p=at(q);frag=vec4(max(0.,p.b.y),theta(p),p.a.x,length(p.a.yzw)/sound(p));}`;}
 program(vs,fs){const g=this.gl;const compile=(type,s)=>{const sh=g.createShader(type);g.shaderSource(sh,s);g.compileShader(sh);if(!g.getShaderParameter(sh,g.COMPILE_STATUS)){const err=g.getShaderInfoLog(sh);g.deleteShader(sh);throw Error(err);}return sh;};let v=compile(g.VERTEX_SHADER,vs),f=compile(g.FRAGMENT_SHADER,fs),p=g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));this.programs.push(p);return {p,loc:{}};}
 target(w,h,count,half=false){const g=this.gl,f=g.createFramebuffer(),textures=[];g.bindFramebuffer(g.FRAMEBUFFER,f);for(let i=0;i<count;i++){const t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,half?g.LINEAR:g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,half?g.LINEAR:g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texImage2D(g.TEXTURE_2D,0,half?g.RGBA16F:g.RGBA32F,w,h,0,g.RGBA,half?g.HALF_FLOAT:g.FLOAT,null);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0+i,g.TEXTURE_2D,t,0);textures.push(t);}
 g.drawBuffers(textures.map((_,i)=>g.COLOR_ATTACHMENT0+i));if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Float framebuffer incomplete');const result={f,textures,w,h};this.resources.push(result);return result;}
 use(pr,target){const g=this.gl;g.useProgram(pr.p);g.bindVertexArray(this.vao);g.bindFramebuffer(g.FRAMEBUFFER,target?target.f:null);if(target){g.viewport(0,0,target.w,target.h);g.drawBuffers(target.textures.map((_,i)=>g.COLOR_ATTACHMENT0+i));}}
 uniform(pr,n,type,v){const g=this.gl;let l=pr.loc[n];if(l===undefined)l=pr.loc[n]=g.getUniformLocation(pr.p,n);if(l===null)return;if(type==='i')g.uniform1i(l,v);else if(type==='f')g.uniform1f(l,v);else if(type==='2i')g.uniform2iv(l,v);else if(type==='2f')g.uniform2fv(l,v);else if(type==='3f')g.uniform3fv(l,v);}
 texture(pr,n,t,unit){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,t);this.uniform(pr,n,'i',unit);}
 bindState(pr,index=this.current){this.texture(pr,'stateA',this.states[index].textures[0],0);this.texture(pr,'stateB',this.states[index].textures[1],1);this.uniform(pr,'N','i',this.n);this.uniform(pr,'tiles','i',this.tiles);this.uniform(pr,'dx','f',this.dx);this.uniform(pr,'Lref','f',this.length);this.uniform(pr,'transportOn','f',this.transport?1:0);}
 uploadInitial(options={}){
  const a=new Float32Array(this.w*this.h*4),b=new Float32Array(a.length),n=this.n;
  for(let k=0;k<n;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const x=(i+.5)*this.dx-4,y=(j+.5)*this.dx-4,z=(k+.5)*this.dx-4,r2=x*x+z*z,r=Math.sqrt(r2);let rho=1,T=1,u=0,v=0,w=0,C=0;
   if(this.case==='vortex'){
    if(r2<7.84&&y*y<9.61){let br=Math.exp(-r2/(7.84-r2)),bz=Math.exp(-y*y/(9.61-y*y));let rad=-.175*(1-2*y*y*9.61/(9.61-y*y)**2)*br*bz,ax=.35*y*(1-r2*7.84/(7.84-r2)**2)*br*bz,sw=.85*Math.exp(-.5*r2)*br*bz;
     u=this.strength*(rad*x-sw*z);v=this.strength*ax;w=this.strength*(rad*z+sw*x);
     const angle=Math.atan2(z,x);
     const rings=.85*Math.exp(-y*y/.055-(r-1.35)**2/.38)*(.08+.92*(.5+.5*Math.cos(7*angle+5*Math.log(r+.2)))**4);
     const helix=.80*Math.exp(-Math.pow(r-(.24+.02*y*y),2)/.028-y*y/4)*(.15+.85*(.5+.5*Math.cos(3*angle-4*y))**2);
     C=(rings+helix)*br*bz;
    }
   }else if(this.case==='uniform'){u=.15;v=-.09;w=.05;C=.3;}
   else if(this.case==='sound'){let eps=options.amplitude||1e-3,phase=2*Math.PI*x/8;rho=1+eps*Math.sin(phase);T=Math.pow(rho,AIR.gamma-1);u=eps*Math.sin(phase);}
   else if(this.case==='shear'){v=(options.amplitude||.08)*Math.sin(2*Math.PI*x/8);}
   else if(this.case==='thermal'){T=1+(options.amplitude||.1)*Math.cos(2*Math.PI*x/8);rho=1/T;}
   else if(this.case==='sod'){rho=x<0?1:.125;let p=x<0?1:.1;T=AIR.gamma*p/rho;}
   const idx=4*((Math.floor(k/this.tiles)*n+j)*this.w+(k%this.tiles)*n+i);
   a[idx]=rho;a[idx+1]=rho*u;a[idx+2]=rho*v;a[idx+3]=rho*w;
   b[idx]=rho*T/(AIR.gamma*(AIR.gamma-1))+.5*rho*(u*u+v*v+w*w);b[idx+1]=rho*C;
  }
  this.initialArrays={a,b};const g=this.gl;for(const target of this.states)for(let c=0;c<2;c++){g.bindTexture(g.TEXTURE_2D,target.textures[c]);g.texSubImage2D(g.TEXTURE_2D,0,0,0,this.w,this.h,g.RGBA,g.FLOAT,c?b:a);}
 }
 stage(input,output,base,dt,t,blend){let p=this.stepProgram;this.use(p,this.states[output]);this.bindState(p,input);this.texture(p,'baseA',this.states[base].textures[0],2);this.texture(p,'baseB',this.states[base].textures[1],3);this.uniform(p,'dt','f',dt);this.uniform(p,'timeNow','f',t);this.uniform(p,'driveAmp','f',this.case==='vortex'&&this.drive?1.2*this.strength:0);this.uniform(p,'blendBase','f',blend);this.uniform(p,'methodOrder','i',this.order);this.gl.drawArrays(this.gl.TRIANGLES,0,3);}
 measure(index=this.current){const g=this.gl;this.use(this.statsProgram,this.statTargets[0]);this.bindState(this.statsProgram,index);g.drawArrays(g.TRIANGLES,0,3);
  for(let i=1;i<this.statTargets.length;i++){const p=this.reduceProgram,src=this.statTargets[i-1];this.use(p,this.statTargets[i]);src.textures.forEach((t,j)=>this.texture(p,'s'+j,t,j));this.uniform(p,'sourceSize','2i',[src.w,src.h]);g.drawArrays(g.TRIANGLES,0,3);}
  const values=[];for(let j=0;j<4;j++){g.readBuffer(g.COLOR_ATTACHMENT0+j);let v=new Float32Array(4);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,v);values.push(v);}
  const [mx,sum,ex,mn]=values,vol=this.dx**3;
  const stats={rate:mx[0],mach:mx[1],Tmax:mx[2]*300,kn:mx[3],mass:sum[0]*vol,energy:sum[1]*vol,kinetic:sum[2]*vol,work:sum[3]*vol,dissipation:ex[0]*vol,tracer:ex[1]*vol,badCells:ex[3],rhoMin:mn[0],Tmin:mn[1]*300,pMin:mn[2]*this.rho0*this.c0**2,rhoMax:-mn[3]};
  stats.valid=Object.values(stats).every(Number.isFinite)&&stats.badCells===0&&stats.rhoMin>0&&stats.Tmin>0;
  if(index===this.current)this.stats=stats;return stats;
 }
 step(forcedDt=null,ignoreGuards=false){if(this.stopped&&!ignoreGuards)return false;const old=this.current,one=(old+1)%3,two=(old+2)%3;
  let dt=forcedDt===null?Math.min(.30/this.stats.rate,this.endTime-this.time):forcedDt;
  if(dt<=1e-12){this.stopped='window';return false;}
  let accepted=null;
  for(let attempt=0;attempt<8;attempt++){
   this.stage(old,one,old,dt,this.time,0);
   const mid=this.measure(one);if(!mid.valid||dt*mid.rate>=.65){dt*=.5;this.retries++;continue;}
   this.stage(one,two,old,dt,this.time+dt,.5);
   const m=this.measure(two);if(m.valid&&dt*m.rate<.65){accepted=m;break;}dt*=.5;this.retries++;
  }
  if(!accepted){this.stopped='numerical';return false;}
  this.current=two;this.stats=accepted;this.time+=dt;this.lastDt=dt;this.steps++;
  this.maxSeen.mach=Math.max(this.maxSeen.mach,this.stats.mach);this.maxSeen.T=Math.max(this.maxSeen.T,this.stats.Tmax);
  if(!ignoreGuards){if(this.stats.Tmax>600||this.stats.Tmin<200)this.stopped='temperature';else if(this.stats.kn>.02)this.stopped='kinetic';else if(this.stats.rhoMax*this.stats.Tmax/300*AIR.p0>1e6)this.stopped='pressure';else if(this.time>=this.endTime-1e-8)this.stopped='window';}
  return true;
 }
 makeOptical(){this.use(this.opticalProgram,this.optical);this.bindState(this.opticalProgram);this.gl.drawArrays(this.gl.TRIANGLES,0,3);}
 record(){const r={step:this.steps,t_us:this.time*this.tunit*1e6,dt_ns:(this.lastDt||0)*this.tunit*1e9,...this.stats};if(this.initial){r.massError=(r.mass-this.initial.mass)/this.initial.mass;r.energyResidual=(r.energy-this.initial.energy-r.work)/this.initial.energy;r.tracerError=this.initial.tracer?(r.tracer-this.initial.tracer)/this.initial.tracer:0;}this.records.push(r);if(this.records.length>4000)this.records.splice(1,1);return r;}
 readState(){let g=this.gl,target=this.states[this.current];g.bindFramebuffer(g.FRAMEBUFFER,target.f);let result=[];for(let j=0;j<2;j++){g.readBuffer(g.COLOR_ATTACHMENT0+j);let a=new Float32Array(this.w*this.h*4);g.readPixels(0,0,this.w,this.h,g.RGBA,g.FLOAT,a);result.push(a);}return result;}
 dispose(){const g=this.gl;for(const r of this.resources){r.textures.forEach(t=>g.deleteTexture(t));g.deleteFramebuffer(r.f);}this.programs.forEach(p=>g.deleteProgram(p));g.deleteVertexArray(this.vao);}
}
window.GasSolver=GasSolver;window.AIR=AIR;
