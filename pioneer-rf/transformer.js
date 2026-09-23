// Browser inference for the actually-trained tiny RF transformer.
// The encoder is frozen. The final classifier is an online REINFORCE actor.

const softmax = xs => {
  const m=Math.max(...xs);
  const es=xs.map(x=>Math.exp(x-m));
  const s=es.reduce((a,b)=>a+b,0)||1;
  return es.map(x=>x/s);
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function linear(v,w,b){
  const out=new Array(w.length);
  for(let o=0;o<w.length;o++){
    let s=b[o];
    const row=w[o];
    for(let i=0;i<v.length;i++) s+=row[i]*v[i];
    out[o]=s;
  }
  return out;
}
function add(a,b){return a.map((v,i)=>v+b[i]);}
function layerNorm(v,gamma,beta){
  let mean=0;
  for(const x of v) mean+=x;
  mean/=v.length;
  let variance=0;
  for(const x of v){const d=x-mean; variance+=d*d;}
  variance/=v.length;
  const inv=1/Math.sqrt(variance+1e-5);
  return v.map((x,i)=>(x-mean)*inv*gamma[i]+beta[i]);
}
function gelu(x){
  const c=Math.sqrt(2/Math.PI);
  return 0.5*x*(1+Math.tanh(c*(x+0.044715*x*x*x)));
}
function pe(t,d){
  const out=Array.from({length:t},()=>Array(d).fill(0));
  for(let p=0;p<t;p++){
    for(let i=0;i<d;i+=2){
      const div=Math.exp(i*(-Math.log(10000)/d));
      out[p][i]=Math.sin(p*div);
      if(i+1<d) out[p][i+1]=Math.cos(p*div);
    }
  }
  return out;
}
function sampleCategorical(p){
  let r=Math.random();
  for(let i=0;i<p.length;i++){r-=p[i]; if(r<=0)return i;}
  return p.length-1;
}

export class RFTransformerPolicy {
  constructor(payload){
    this.payload=payload;
    this.w=payload.weights;
    this.a=payload.architecture;
    this.pos=pe(this.a.t,this.a.d_model);
    this.deltaW=Array.from({length:this.a.classes},()=>Array(this.a.embedding_dim || this.a.d_model).fill(0));
    this.deltaB=Array(this.a.classes).fill(0);
    this.baseline=0.35;
    this.steps=0;
    this.rewardEMA=0;
    this.lr=0.010;
    this.trainOnline=true;
  }

  static async load(url="trained_weights.json"){
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error("trained weights fetch failed: "+res.status);
    return new RFTransformerPolicy(await res.json());
  }

  resetOnline(){
    this.deltaW.forEach(r=>r.fill(0));
    this.deltaB.fill(0);
    this.baseline=0.35;
    this.steps=0;
    this.rewardEMA=0;
  }

  encode(spec){
    const {d_model:d,heads}=this.a;
    const hd=d/heads;
    let x=spec.map((row,t)=>add(linear(row,this.w["inp.weight"],this.w["inp.bias"]),this.pos[t]));
    const q=x.map(v=>linear(v,this.w["q.weight"],this.w["q.bias"]));
    const k=x.map(v=>linear(v,this.w["k.weight"],this.w["k.bias"]));
    const val=x.map(v=>linear(v,this.w["v.weight"],this.w["v.bias"]));
    const ctx=Array.from({length:x.length},()=>Array(d).fill(0));

    for(let h=0;h<heads;h++){
      const off=h*hd;
      for(let ti=0;ti<x.length;ti++){
        const scores=[];
        for(let tj=0;tj<x.length;tj++){
          let s=0;
          for(let j=0;j<hd;j++) s+=q[ti][off+j]*k[tj][off+j];
          scores.push(s/Math.sqrt(hd));
        }
        const att=softmax(scores);
        for(let j=0;j<hd;j++){
          let s=0;
          for(let tj=0;tj<x.length;tj++) s+=att[tj]*val[tj][off+j];
          ctx[ti][off+j]=s;
        }
      }
    }

    x=x.map((v,t)=>layerNorm(
      add(v,linear(ctx[t],this.w["o.weight"],this.w["o.bias"])),
      this.w["ln1.weight"],this.w["ln1.bias"]
    ));
    x=x.map(v=>{
      const h=linear(v,this.w["ff1.weight"],this.w["ff1.bias"]).map(gelu);
      const ff=linear(h,this.w["ff2.weight"],this.w["ff2.bias"]);
      return layerNorm(add(v,ff),this.w["ln2.weight"],this.w["ln2.bias"]);
    });
    // Flatten preserves the time-indexed transformer representation. The trained
    // policy head was learned on this exact embedding.
    return x.flat();
  }

  adapterEmbedding(emb){
    let n=0; for(const v of emb)n+=v*v; n=Math.sqrt(n)+1e-8;
    return emb.map(v=>v/n);
  }

  logitsFromEmbedding(emb){
    const base=linear(emb,this.w["cls.weight"],this.w["cls.bias"]);
    const ae=this.adapterEmbedding(emb);
    for(let c=0;c<base.length;c++){
      base[c]+=this.deltaB[c];
      for(let j=0;j<ae.length;j++) base[c]+=this.deltaW[c][j]*ae[j];
    }
    return base;
  }

  act(spec,{sample=true,temperature=0.72}={}){
    const embedding=this.encode(spec);
    const logits=this.logitsFromEmbedding(embedding);
    const probs=softmax(logits.map(x=>x/temperature));
    let action;
    if(sample) action=sampleCategorical(probs);
    else {
      action=0;
      for(let i=1;i<probs.length;i++) if(probs[i]>probs[action]) action=i;
    }
    const entropy=-probs.reduce((s,p)=>s+(p>1e-12?p*Math.log(p):0),0);
    return {action,probs,logits,embedding,entropy};
  }

  reinforce(observation,reward,learningRate=this.lr){
    const {action,probs,embedding}=observation;
    const ae=this.adapterEmbedding(embedding);
    const adv=reward-this.baseline;
    if(this.trainOnline){
      // Gradient ASCENT on advantage * log pi(a|s), actor head only.
      // Frozen encoder keeps the browser update cheap and stable.
      for(let c=0;c<probs.length;c++){
        const g=((c===action?1:0)-probs[c])*adv;
        this.deltaB[c]=clamp(this.deltaB[c]+learningRate*g,-1.2,1.2);
        for(let j=0;j<ae.length;j++){
          const next=(1-learningRate*0.02)*this.deltaW[c][j]+learningRate*g*ae[j];
          this.deltaW[c][j]=clamp(next,-0.65,0.65);
        }
      }
      this.steps++;
      this.baseline=0.965*this.baseline+0.035*reward;
      this.rewardEMA=this.steps===1?reward:0.965*this.rewardEMA+0.035*reward;
    }
    return {advantage:adv,baseline:this.baseline,rewardEMA:this.rewardEMA,steps:this.steps};
  }
}
