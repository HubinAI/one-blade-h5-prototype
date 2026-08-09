/**
 * 0809-11F-4B: 极简 WebAudio SFX — zero external assets
 * L1 normal < L2 heavy < L3 burst
 */
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) { ctx = new AudioContext(); masterGain = ctx.createGain(); masterGain.gain.value = 0.55; masterGain.connect(ctx.destination); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}
const cd: Record<string,number>={};
function thr(k:string,ms:number):boolean{const n=performance.now();if(cd[k]&&n-cd[k]<ms)return true;cd[k]=n;return false}
function jit(b:number,r=0.08):number{return b*(1+(Math.random()-0.5)*r*2)}
function ramp(g:GainNode,a:number,s:number,r:number,c:AudioContext):void{const n=c.currentTime;g.gain.setValueAtTime(0,n);g.gain.linearRampToValueAtTime(1,n+a);g.gain.setValueAtTime(1,n+a+s);g.gain.linearRampToValueAtTime(0,n+a+s+r)}

let _sw=0;
export function playSwing():void{const c=ensureCtx();if(!c||!masterGain)return;const n=performance.now();if(n-_sw<100)return;_sw=n;const t=c.currentTime,l=c.sampleRate*0.08,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.35;const s=c.createBufferSource();s.buffer=b;const h=c.createBiquadFilter();h.type="highpass";h.frequency.value=jit(2000);const g=c.createGain();s.connect(h).connect(g).connect(masterGain);ramp(g,0.003,0.03,0.04,c);s.playbackRate.value=jit(1,0.12);s.start(t);s.stop(t+0.12)}

export function playHit(n:number):void{const c=ensureCtx();if(!c||!masterGain)return;const t=c.currentTime;const m=masterGain;
if(n<=2){if(thr("h",50))return;const l=c.sampleRate*0.06,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.4;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(1200);f.Q.value=4;const g=c.createGain();s.connect(f).connect(g).connect(m);ramp(g,0.002,0.01,0.03,c);s.playbackRate.value=jit(1,0.15);s.start(t);s.stop(t+0.10);const o=c.createOscillator();o.type="sine";o.frequency.value=jit(80);const g2=c.createGain();o.connect(g2).connect(m);ramp(g2,0.001,0.01,0.04,c);o.start(t);o.stop(t+0.08)}
else if(n<=5){if(thr("hh",60))return;const l=c.sampleRate*0.10,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.55;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(700);f.Q.value=2;const g=c.createGain();s.connect(f).connect(g).connect(m);ramp(g,0.003,0.02,0.05,c);s.start(t);s.stop(t+0.15);const o=c.createOscillator();o.type="triangle";o.frequency.value=jit(60);const g2=c.createGain();o.connect(g2).connect(m);ramp(g2,0.002,0.03,0.06,c);o.start(t);o.stop(t+0.12)}
else{if(thr("hm",80))return;const o=c.createOscillator();o.type="triangle";o.frequency.value=jit(45);const g=c.createGain();o.connect(g).connect(m);ramp(g,0.005,0.04,0.08,c);o.start(t);o.stop(t+0.16);const l=c.sampleRate*0.12,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.65;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(600);f.Q.value=3;const g2=c.createGain();s.connect(f).connect(g2).connect(m);ramp(g2,0.004,0.03,0.06,c);s.start(t);s.stop(t+0.16)}}

export function playExplosion():void{const c=ensureCtx();if(!c||!masterGain)return;const m=masterGain;if(thr("ex",150))return;const t=c.currentTime;const o=c.createOscillator();o.type="sawtooth";o.frequency.value=jit(35);const g=c.createGain();o.connect(g).connect(m);ramp(g,0.003,0.02,0.12,c);o.start(t);o.stop(t+0.18);const l=c.sampleRate*0.18,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(l*0.25))*0.7;const s=c.createBufferSource();s.buffer=b;const h=c.createBiquadFilter();h.type="highpass";h.frequency.value=400;const g2=c.createGain();s.connect(h).connect(g2).connect(m);ramp(g2,0.005,0.02,0.15,c);s.start(t);s.stop(t+0.22)}

export function playPlayerHurt():void{const c=ensureCtx();if(!c||!masterGain)return;const m=masterGain;if(thr("hu",200))return;const t=c.currentTime;const o=c.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(220,t);o.frequency.linearRampToValueAtTime(110,t+0.15);const g=c.createGain();const lpf=c.createBiquadFilter();lpf.type="lowpass";lpf.frequency.setValueAtTime(800,t);lpf.frequency.linearRampToValueAtTime(200,t+0.12);o.connect(lpf).connect(g).connect(m);ramp(g,0.003,0.04,0.10,c);o.start(t);o.stop(t+0.20);const l=c.sampleRate*0.08,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(l*0.15))*0.5;const s=c.createBufferSource();s.buffer=b;const g2=c.createGain();s.connect(g2).connect(m);ramp(g2,0.002,0.01,0.06,c);s.start(t);s.stop(t+0.12)}

export function playEliteKill():void{const c=ensureCtx();if(!c||!masterGain)return;const m=masterGain;if(thr("ek",300))return;const t=c.currentTime;[130,196,262,392].forEach((f,i)=>{const o=c.createOscillator();o.type="triangle";const g=c.createGain(),s=t+i*0.08;o.frequency.value=f;o.connect(g).connect(m);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.25,s+0.02);g.gain.linearRampToValueAtTime(0,s+0.20);o.start(s);o.stop(s+0.25)});setTimeout(()=>{if(!m)return;const o=c.createOscillator();o.type="triangle";o.frequency.value=65;const g=c.createGain();o.connect(g).connect(m);g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(0.3,c.currentTime+0.01);g.gain.linearRampToValueAtTime(0,c.currentTime+0.35);o.start();o.stop(c.currentTime+0.40)},320)}

export function playVictory():void{const c=ensureCtx();if(!c||!masterGain)return;const m=masterGain;if(thr("vy",1000))return;const t=c.currentTime;[196,262,330,392,523,659].forEach((f,i)=>{const o=c.createOscillator();o.type="sine";const g=c.createGain(),s=t+i*0.10;o.frequency.value=f;o.connect(g).connect(m);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.2,s+0.03);g.gain.linearRampToValueAtTime(0,s+0.30);o.start(s);o.stop(s+0.35)})}

export function initSfx():void{ensureCtx()}
export function disposeSfx():void{if(ctx){ctx.close();ctx=null;masterGain=null}}
