/**
 * AudioService — Web Audio API 合成音效
 * 不依赖外部音频文件，用 OscillatorNode + GainNode 生成即时音效。
 * 面向 IAA 原型验证阶段，后续正式版替换为真实音频资源。
 */

let ctx: AudioContext | null = null;

function ensureContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

type SoundDef = {
  frequency: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  decay: number;
  detune?: number;
  harmonics?: number[];
};

const SOUNDS: Record<string, SoundDef | SoundDef[]> = {
  // 拔刀 — 短促金属清音
  slash_draw: {
    frequency: 880,
    type: "triangle",
    duration: 0.08,
    gain: 0.22,
    decay: 0.04,
    harmonics: [2200]
  },
  // 切割命中 — 柔脆纸片声
  slash_hit: {
    frequency: 420,
    type: "sawtooth",
    duration: 0.06,
    gain: 0.16,
    decay: 0.03,
    detune: -40
  },
  // 爆炸 — 低沉闷响
  explosion: {
    frequency: 120,
    type: "sawtooth",
    duration: 0.35,
    gain: 0.38,
    decay: 0.18,
    harmonics: [240, 60]
  },
  // 收刀破阵 — 金属回响
  slash_end: {
    frequency: 660,
    type: "triangle",
    duration: 0.14,
    gain: 0.18,
    decay: 0.06,
    harmonics: [1320]
  },
  // 一刀破阵大反馈 — 低频震荡 + 高频闪光
  one_blade_break: [
    { frequency: 180, type: "sawtooth", duration: 0.55, gain: 0.32, decay: 0.28, harmonics: [90] },
    { frequency: 1200, type: "sine", duration: 0.18, gain: 0.14, decay: 0.08 }
  ],
  // 阵眼崩散 — 紫色震波
  core_collapse: [
    { frequency: 260, type: "triangle", duration: 0.32, gain: 0.26, decay: 0.16 },
    { frequency: 520, type: "sine", duration: 0.22, gain: 0.12, decay: 0.1 }
  ],
  // 连锁击杀 — 叠加短促
  chain_kill: { frequency: 780, type: "square", duration: 0.04, gain: 0.12, decay: 0.02 },
  // 三选一弹窗出现
  buff_open: { frequency: 523, type: "sine", duration: 0.2, gain: 0.15, decay: 0.1, harmonics: [659] },
  // 三选一选择确认
  buff_select: { frequency: 784, type: "sine", duration: 0.12, gain: 0.18, decay: 0.06 },
  // 防线受损
  defense_hit: { frequency: 160, type: "square", duration: 0.15, gain: 0.28, decay: 0.08 },
  // 残锋挥刀 — 低沉暗声
  slash_weak: { frequency: 280, type: "triangle", duration: 0.06, gain: 0.10, decay: 0.03 },
  // 破阵锋挥刀 — 高亮金声
  slash_burst: [
    { frequency: 1100, type: "triangle", duration: 0.10, gain: 0.24, decay: 0.04 },
    { frequency: 2200, type: "sine", duration: 0.06, gain: 0.08, decay: 0.02 }
  ],
  // 补给拾取
  pickup: { frequency: 988, type: "sine", duration: 0.12, gain: 0.14, decay: 0.06, harmonics: [1319] },
  // 胜利结算
  victory: [
    { frequency: 523, type: "sine", duration: 0.25, gain: 0.18, decay: 0.1 },
    { frequency: 659, type: "sine", duration: 0.25, gain: 0.16, decay: 0.1 },
    { frequency: 784, type: "sine", duration: 0.35, gain: 0.20, decay: 0.12 }
  ],
  // 失败
  defeat: { frequency: 200, type: "sawtooth", duration: 0.6, gain: 0.22, decay: 0.3, harmonics: [100] }
};

function playSingle(audioCtx: AudioContext, def: SoundDef, startTime: number) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = def.type;
  osc.frequency.value = def.frequency;
  if (def.detune) osc.detune.value = def.detune;

  gain.gain.setValueAtTime(def.gain, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + def.duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(startTime);
  osc.stop(startTime + def.duration + 0.02);

  // Harmonics overlay
  if (def.harmonics) {
    for (const hFreq of def.harmonics) {
      const hOsc = audioCtx.createOscillator();
      const hGain = audioCtx.createGain();
      hOsc.type = "sine";
      hOsc.frequency.value = hFreq;
      hGain.gain.setValueAtTime(def.gain * 0.35, startTime);
      hGain.gain.exponentialRampToValueAtTime(0.001, startTime + def.duration * 0.7);
      hOsc.connect(hGain);
      hGain.connect(audioCtx.destination);
      hOsc.start(startTime);
      hOsc.stop(startTime + def.duration + 0.02);
    }
  }
}

function playDef(name: string) {
  const audioCtx = ensureContext();
  const startTime = audioCtx.currentTime;
  const def = SOUNDS[name];
  if (!def) return;

  if (Array.isArray(def)) {
    for (const single of def) {
      playSingle(audioCtx, single, startTime);
    }
  } else {
    playSingle(audioCtx, def, startTime);
  }
}

export const AudioService = {
  /** 在战斗中拔刀时播放 */
  slashDraw(tier: "weak" | "normal" | "strong" | "burst") {
    if (tier === "burst") playDef("slash_burst");
    else if (tier === "weak") playDef("slash_weak");
    else playDef("slash_draw");
  },

  /** 刀芒命中敌军 */
  slashHit() {
    playDef("slash_hit");
  },

  /** 收刀结束 */
  slashEnd() {
    playDef("slash_end");
  },

  /** 火药兵爆炸 */
  explosion() {
    playDef("explosion");
  },

  /** 一刀破阵大反馈 */
  oneBladeBreak() {
    playDef("one_blade_break");
  },

  /** 阵眼崩散 */
  coreCollapse() {
    playDef("core_collapse");
  },

  /** 连锁击杀 */
  chainKill() {
    playDef("chain_kill");
  },

  /** 三选一弹窗出现 */
  buffOpen() {
    playDef("buff_open");
  },

  /** 三选一选择确认 */
  buffSelect() {
    playDef("buff_select");
  },

  /** 防线受损 */
  defenseHit() {
    playDef("defense_hit");
  },

  /** 补给拾取 */
  pickup() {
    playDef("pickup");
  },

  /** 胜利 */
  victory() {
    playDef("victory");
  },

  /** 失败 */
  defeat() {
    playDef("defeat");
  }
};
