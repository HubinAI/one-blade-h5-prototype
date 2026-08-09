/**
 * 0809-11F-4B + 4E: WebAudio SFX + 三态BGM
 * master → [sfxGain, bgmGain]
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      masterGain = ctx.createGain(); masterGain.gain.value = 0.55; masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(masterGain);
      bgmGain = ctx.createGain(); bgmGain.gain.value = 0; bgmGain.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}

// === tools ===
const cd: Record<string,number>={};
function thr(k:string,ms:number):boolean{const n=performance.now();if(cd[k]&&n-cd[k]<ms)return true;cd[k]=n;return false}
function jit(b:number,r=0.08):number{return b*(1+(Math.random()-0.5)*r*2)}
function ramp(g:GainNode,a:number,s:number,r:number,c:AudioContext):void{const n=c.currentTime;g.gain.setValueAtTime(0,n);g.gain.linearRampToValueAtTime(1,n+a);g.gain.setValueAtTime(1,n+a+s);g.gain.linearRampToValueAtTime(0,n+a+s+r)}

/* ══════════════════ SFX (unchanged) ══════════════════ */
let _sw=0;
export function playSwing():void{const c=ensureCtx();if(!c||!sfxGain)return;const n=performance.now();if(n-_sw<100)return;_sw=n;const t=c.currentTime,l=c.sampleRate*0.08,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.35;const s=c.createBufferSource();s.buffer=b;const h=c.createBiquadFilter();h.type="highpass";h.frequency.value=jit(2000);const g=c.createGain();s.connect(h).connect(g).connect(sfxGain);ramp(g,0.003,0.03,0.04,c);s.playbackRate.value=jit(1,0.12);s.start(t);s.stop(t+0.12)}

export function playHit(n:number):void{const c=ensureCtx();if(!c||!sfxGain)return;const t=c.currentTime;const m=sfxGain;
if(n<=2){if(thr("h",50))return;const l=c.sampleRate*0.06,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.4;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(1200);f.Q.value=4;const g=c.createGain();s.connect(f).connect(g).connect(m);ramp(g,0.002,0.01,0.03,c);s.playbackRate.value=jit(1,0.15);s.start(t);s.stop(t+0.10);const o=c.createOscillator();o.type="sine";o.frequency.value=jit(80);const g2=c.createGain();o.connect(g2).connect(m);ramp(g2,0.001,0.01,0.04,c);o.start(t);o.stop(t+0.08)}
else if(n<=5){if(thr("hh",60))return;const l=c.sampleRate*0.10,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.55;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(700);f.Q.value=2;const g=c.createGain();s.connect(f).connect(g).connect(m);ramp(g,0.003,0.02,0.05,c);s.start(t);s.stop(t+0.15);const o=c.createOscillator();o.type="triangle";o.frequency.value=jit(60);const g2=c.createGain();o.connect(g2).connect(m);ramp(g2,0.002,0.03,0.06,c);o.start(t);o.stop(t+0.12)}
else{if(thr("hm",80))return;const o=c.createOscillator();o.type="triangle";o.frequency.value=jit(45);const g=c.createGain();o.connect(g).connect(m);ramp(g,0.005,0.04,0.08,c);o.start(t);o.stop(t+0.16);const l=c.sampleRate*0.12,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.sin(i/l*Math.PI)*0.65;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type="bandpass";f.frequency.value=jit(600);f.Q.value=3;const g2=c.createGain();s.connect(f).connect(g2).connect(m);ramp(g2,0.004,0.03,0.06,c);s.start(t);s.stop(t+0.16)}}

export function playExplosion():void{const c=ensureCtx();if(!c||!sfxGain)return;const m=sfxGain;if(thr("ex",150))return;const t=c.currentTime;const o=c.createOscillator();o.type="sawtooth";o.frequency.value=jit(35);const g=c.createGain();o.connect(g).connect(m);ramp(g,0.003,0.02,0.12,c);o.start(t);o.stop(t+0.18);const l=c.sampleRate*0.18,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(l*0.25))*0.7;const s=c.createBufferSource();s.buffer=b;const h=c.createBiquadFilter();h.type="highpass";h.frequency.value=400;const g2=c.createGain();s.connect(h).connect(g2).connect(m);ramp(g2,0.005,0.02,0.15,c);s.start(t);s.stop(t+0.22)}

export function playPlayerHurt():void{const c=ensureCtx();if(!c||!sfxGain)return;const m=sfxGain;if(thr("hu",200))return;const t=c.currentTime;const o=c.createOscillator();o.type="sawtooth";o.frequency.setValueAtTime(220,t);o.frequency.linearRampToValueAtTime(110,t+0.15);const g=c.createGain();const lpf=c.createBiquadFilter();lpf.type="lowpass";lpf.frequency.setValueAtTime(800,t);lpf.frequency.linearRampToValueAtTime(200,t+0.12);o.connect(lpf).connect(g).connect(m);ramp(g,0.003,0.04,0.10,c);o.start(t);o.stop(t+0.20);const l=c.sampleRate*0.08,b=c.createBuffer(1,l,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<l;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(l*0.15))*0.5;const s=c.createBufferSource();s.buffer=b;const g2=c.createGain();s.connect(g2).connect(m);ramp(g2,0.002,0.01,0.06,c);s.start(t);s.stop(t+0.12)}

export function playEliteKill():void{const c=ensureCtx();if(!c||!sfxGain)return;const m=sfxGain;if(thr("ek",300))return;const t=c.currentTime;[130,196,262,392].forEach((f,i)=>{const o=c.createOscillator();o.type="triangle";const g=c.createGain(),s=t+i*0.08;o.frequency.value=f;o.connect(g).connect(m);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.25,s+0.02);g.gain.linearRampToValueAtTime(0,s+0.20);o.start(s);o.stop(s+0.25)});setTimeout(()=>{if(!m)return;const o=c.createOscillator();o.type="triangle";o.frequency.value=65;const g=c.createGain();o.connect(g).connect(m);g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(0.3,c.currentTime+0.01);g.gain.linearRampToValueAtTime(0,c.currentTime+0.35);o.start();o.stop(c.currentTime+0.40)},320)}

export function playVictory():void{const c=ensureCtx();if(!c||!sfxGain)return;const m=sfxGain;if(thr("vy",1000))return;const t=c.currentTime;[196,262,330,392,523,659].forEach((f,i)=>{const o=c.createOscillator();o.type="sine";const g=c.createGain(),s=t+i*0.10;o.frequency.value=f;o.connect(g).connect(m);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(0.2,s+0.03);g.gain.linearRampToValueAtTime(0,s+0.30);o.start(s);o.stop(s+0.35)})}

/* ══════════════════ 0809-11F-4F: 军令跑马灯SFX ══════════════════ */
export function playRouletteTick(finalTick: boolean): void {
  const c = ensureCtx(); if (!c || !sfxGain) return;
  const t = c.currentTime; const m = sfxGain;
  if (finalTick) {
    // 最终定音: 低频+厚impact
    const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 65;
    const g = c.createGain(); o.connect(g).connect(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01);
    g.gain.linearRampToValueAtTime(0, t + 0.18); o.start(t); o.stop(t + 0.22);
    // 短thump
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = 50;
    const g2 = c.createGain(); o2.connect(g2).connect(m);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.10, t + 0.005);
    g2.gain.linearRampToValueAtTime(0, t + 0.12); o2.start(t); o2.stop(t + 0.15);
  } else {
    // 轻"登": triangle+sine
    const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = jit(180, 0.06);
    const g = c.createGain(); o.connect(g).connect(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.005);
    g.gain.linearRampToValueAtTime(0, t + 0.06); o.start(t); o.stop(t + 0.08);
  }
}

/* ══════════════════ BGM 系统 ══════════════════ */
type BgmState = "silent" | "home" | "battle" | "elite" | "fading";
let _bgmState: BgmState = "silent";
let _bgmTarget: "home" | "battle" | "elite" = "home";

// BGM nodes that need cleanup
let _bgmNodes: Array<AudioScheduledSourceNode | OscillatorNode> = [];
let _bgmTimer: number | null = null;
let _bgmBeatIndex = 0;

const HOME_BPM = 75;
const BATTLE_BPM = 105;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16]; // D minor pentatonic intervals

function noteFromInterval(base: number, interval: number): number {
  return base * Math.pow(2, interval / 12);
}

function stopBgmNodes(): void {
  for (const n of _bgmNodes) {
    try { n.stop(); } catch { /* already stopped */ }
  }
  _bgmNodes = [];
  if (_bgmTimer) { clearInterval(_bgmTimer); _bgmTimer = null; }
}

function rampBgm(target: number, dur: number): void {
  if (!bgmGain || !ctx) return;
  bgmGain.gain.cancelScheduledValues(ctx.currentTime);
  bgmGain.gain.linearRampToValueAtTime(target, ctx.currentTime + dur);
}

// Penta melody note for given step
function pickNote(step: number): number {
  const base = 146.83; // D3
  const octave = Math.floor(step / 5);
  const idx = step % 5;
  const intervals = [0, 2, 4, 7, 9]; // pentatonic
  return base * Math.pow(2, octave + intervals[idx] / 12);
}

function playBgmTick(): void {
  if (!ctx || !bgmGain || _bgmState === "silent" || _bgmState === "fading") return;
  _bgmBeatIndex++;

  const isHome = _bgmState === "home";
  const bpm = isHome ? HOME_BPM : BATTLE_BPM;
  const beatSec = 60 / bpm;

  // Home: only play on beats 0 and 2 (sparse)
  if (isHome && _bgmBeatIndex % 4 > 1) return;

  const t = ctx.currentTime;

  // Soft pulse note (pentatonic)
  const note = pickNote(_bgmBeatIndex % (isHome ? 4 : 6));
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = note;
  const g = ctx.createGain();
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = isHome ? 500 : 800;
  osc.connect(lpf).connect(g).connect(bgmGain);
  const vol = isHome ? 0.09 : (_bgmState === "elite" ? 0.14 : 0.11);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.linearRampToValueAtTime(0, t + beatSec * (isHome ? 1.8 : 1.2));
  osc.start(t); osc.stop(t + beatSec * 2.5);
  _bgmNodes.push(osc);

  // Battle/Elite: drum pulse
  if (!isHome && _bgmBeatIndex % 2 === 0) {
    const drumOsc = ctx.createOscillator();
    drumOsc.type = "triangle";
    drumOsc.frequency.value = _bgmState === "elite" ? 65 : 55;
    const dg = ctx.createGain();
    drumOsc.connect(dg).connect(bgmGain);
    const dv = _bgmState === "elite" ? 0.12 : 0.08;
    dg.gain.setValueAtTime(0, t);
    dg.gain.linearRampToValueAtTime(dv, t + 0.01);
    dg.gain.linearRampToValueAtTime(0, t + beatSec * 0.6);
    drumOsc.start(t); drumOsc.stop(t + beatSec * 1.0);
    _bgmNodes.push(drumOsc);
  }

  // Elite extra: heavier hit on beat 0
  if (_bgmState === "elite" && _bgmBeatIndex % 4 === 0) {
    const eOsc = ctx.createOscillator();
    eOsc.type = "sawtooth";
    eOsc.frequency.value = 40;
    const eg = ctx.createGain();
    const elpf = ctx.createBiquadFilter();
    elpf.type = "lowpass"; elpf.frequency.value = 200;
    eOsc.connect(elpf).connect(eg).connect(bgmGain);
    eg.gain.setValueAtTime(0, t);
    eg.gain.linearRampToValueAtTime(0.10, t + 0.01);
    eg.gain.linearRampToValueAtTime(0, t + beatSec * 0.5);
    eOsc.start(t); eOsc.stop(t + beatSec * 0.8);
    _bgmNodes.push(eOsc);
  }
}

function startBgmInternal(state: "home" | "battle" | "elite"): void {
  const c = ensureCtx();
  if (!c || !bgmGain) return;
  stopBgmNodes();
  _bgmState = state;
  _bgmTarget = state;
  _bgmBeatIndex = 0;
  const bpm = state === "home" ? HOME_BPM : BATTLE_BPM;
  const interval = (60 / bpm) * 1000;
  _bgmTimer = window.setInterval(playBgmTick, interval);
  // 0809-11F-4E-1: 启动时必须ramp到目标gain
  const targetGain = state === "home" ? 0.16 : state === "battle" ? 0.20 : 0.24;
  rampBgm(targetGain, 0.30);
  // Immediately play first note
  setTimeout(playBgmTick, 10);
}

export function setBgmHome(): void {
  if (_bgmState === "home" || _bgmState === "silent") { startBgmInternal("home"); return; }
  rampBgm(0, 0.3);
  setTimeout(() => startBgmInternal("home"), 300);
}

export function setBgmBattle(): void {
  if (_bgmState === "battle") return;
  rampBgm(0, 0.25);
  setTimeout(() => startBgmInternal("battle"), 250);
}

export function setBgmElite(): void {
  if (_bgmState === "elite") return;
  // Strengthen in-place if already battle
  if (_bgmState === "battle") {
    _bgmState = "elite"; _bgmTarget = "elite";
    if (bgmGain && ctx) { bgmGain.gain.cancelScheduledValues(ctx.currentTime); rampBgm(0.24, 0.40); }
    return;
  }
  rampBgm(0, 0.20);
  setTimeout(() => startBgmInternal("elite"), 200);
}

export function setBgmOff(): void {
  _bgmState = "fading";
  rampBgm(0, 0.35);
  setTimeout(() => { stopBgmNodes(); _bgmState = "silent"; }, 400);
}

export function initSfx(): void { ensureCtx(); }
export function disposeSfx(): void {
  stopBgmNodes();
  if (ctx) { ctx.close(); ctx = null; masterGain = null; sfxGain = null; bgmGain = null; }
}
