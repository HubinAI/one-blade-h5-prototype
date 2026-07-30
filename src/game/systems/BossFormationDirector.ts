// ========================================================================
// S3: BossFormationDirector — 阵势压境导演
// ========================================================================
import {
  FORMATION_CONFIG,
  type FormationRuntime,
  type FormationRuntimeNode,
  type FormationNodeType,
  type FormationPhase,
  type Vec2,
} from "../config/bossFormation";
import { getTemplateById } from "./formationPatterns";

export interface FormationCollisionEvent {
  kind: "threat_destroyed" | "energy_collected" | "counter_hit" | "counter_reflected" | "forbidden_hit" | "threat_reached_defense";
  nodeId: string;
  position: Vec2;
}

export interface SlashPreviewResult {
  hitNodes: { id: string; type: FormationNodeType; x: number; y: number }[];
  hitsForbidden: boolean;
  scores: { threats: number; energy: number; counter: boolean };
}

export interface FormationSnapshot {
  phase: FormationPhase;
  elapsed: number;
  formations: FormationRuntime[];
  energy: number;
  hp: number;
  hasCounterOpp: boolean;
  counterReady: boolean;
  windowType: "none" | "small" | "large";
  windowTimer: number;
}

export class BossFormationDirector {
  private _formations: FormationRuntime[] = [];
  private _elapsed = 0;
  private _nextSpawnAt = 0;
  private _formationSeq = 0;
  private _seed = 1;
  private _energy = FORMATION_CONFIG.bladeEconomy.initial;
  private _maxEnergy = 100;
  private _hp = 100;
  private _maxHp = 100;
  private _windowType: "none" | "small" | "large" = "none";
  private _windowTimer = 0;
  private _completed = false;
  private _random: () => number;

  constructor() {
    let s = 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  setSeed(n: number) {
    this._seed = n;
    let s = n || 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  get completed(): boolean { return this._completed; }
  get windowType() { return this._windowType; }

  /** 主更新：移动阵列、检测防线、清理墓碑 */
  update(dt: number, /* 供 Game.ts 传递刀势/HP */ energy?: number, hp?: number): void {
    if (this._completed) return;
    this._elapsed += dt;
    if (energy !== undefined) this._energy = energy;
    if (hp !== undefined) this._hp = hp;

    // 破绽计时
    if (this._windowType !== "none") {
      this._windowTimer += dt;
      const maxDur = this._windowType === "large"
        ? FORMATION_CONFIG.windowLargeDuration
        : FORMATION_CONFIG.windowSmallDuration;
      if (this._windowTimer >= maxDur) {
        this._windowType = "none";
        this._windowTimer = 0;
      }
    }

    // 生成新阵列
    if (this._elapsed >= this._nextSpawnAt && this._formations.length < FORMATION_CONFIG.maxFormations) {
      this.spawnFormation();
    }

    // 移动所有活跃阵列
    const defense = FORMATION_CONFIG.defenseLine;
    for (const fm of this._formations) {
      if (!fm.active) continue;
      const dy = fm.velocityY * dt;
      fm.originY += dy;
      for (const node of fm.nodes) {
        if (!node.active) continue;
        node.worldY += dy;
        node.proximity = Math.max(0, Math.min(1, (node.worldY - FORMATION_CONFIG.spawnLine) / (defense - FORMATION_CONFIG.spawnLine)));
      }
    }

    // 清理已完成阵列（所有节点不活跃/已出屏）→ 释放槽位给新阵列
    this._formations = this._formations.filter(fm => fm.nodes.some(n => n.active && n.worldY < defense + 40));

    // 生成新阵列（仅统计活跃阵列数）
    const activeFormations = this._formations.filter(f => f.active).length;
    if (this._elapsed >= this._nextSpawnAt && activeFormations < FORMATION_CONFIG.maxFormations) {
      this.spawnFormation();
    }

    // 所有阵列已离开屏幕 → 结束
    if (this._elapsed >= FORMATION_CONFIG.totalDuration &&
        this._formations.length === 0) {
      this._completed = true;
    }
  }

  // ================================================================
  // 阵列生成
  // ================================================================

  private spawnFormation(): void {
    const templates = ["diagonal_pressure", "pincer", "heavy_pressure"];
    const tid = templates[this._formationSeq % templates.length];
    const template = getTemplateById(tid);
    if (!template) return;

    const id = `fm_${this._formationSeq}`;
    const originX = 160 + (this._formationSeq % 3) * 40;  // 偏移避免完全重叠
    const spawnY = FORMATION_CONFIG.spawnLine + (this._formationSeq > 0 ? -20 : 0);

    const nodes: FormationRuntimeNode[] = template.nodes.map(ndef => ({
      id: `${id}_${ndef.id}`,
      type: ndef.type,
      radius: FORMATION_CONFIG.nodeRadius[ndef.type],
      worldX: originX + ndef.offset.x,
      worldY: spawnY + ndef.offset.y,
      active: true,
      proximity: 0,
    }));

    const fm: FormationRuntime = {
      id,
      templateId: tid,
      nodes,
      links: template.links.map(l => ({ ...l })),
      originY: spawnY,
      velocityY: FORMATION_CONFIG.formationSpeed,
      spawnedAt: this._elapsed,
      active: true,
    };

    this._formations.push(fm);
    this._nextSpawnAt = this._elapsed + FORMATION_CONFIG.formationInterval;
    this._formationSeq++;
    if (this._formations.length > FORMATION_CONFIG.maxFormations) {
      // 停用最旧阵列（不删除，节点继续下移）
      const oldest = this._formations.find(f => f.active);
      if (oldest && this._formations.length > 2) oldest.active = false;
    }
  }

  // ================================================================
  // 防线检测（返回触线事件）
  // ================================================================

  checkDefenseLine(): FormationCollisionEvent[] {
    const events: FormationCollisionEvent[] = [];
    const defense = FORMATION_CONFIG.defenseLine;
    for (const fm of this._formations) {
      if (!fm.active) continue;
      for (const node of fm.nodes) {
        if (!node.active) continue;
        if (node.type === "threat" && node.worldY >= defense) {
          node.active = false;
          events.push({
            kind: "threat_reached_defense",
            nodeId: node.id,
            position: { x: node.worldX, y: node.worldY },
          });
        }
      }
    }
    return events;
  }

  // ================================================================
  // 预览（拖刀时预测）
  // ================================================================

  previewSlash(a: Vec2, b: Vec2): SlashPreviewResult {
    const hitNodes: SlashPreviewResult["hitNodes"] = [];
    let threats = 0, energy = 0, counter = false;
    let hitsForbidden = false;
    const activeNodes = this.getAllActiveNodes();

    for (const node of activeNodes) {
      if (this.pointInSegment(a, b, node)) {
        hitNodes.push({ id: node.id, type: node.type, x: node.worldX, y: node.worldY });
        if (node.type === "forbidden") hitsForbidden = true;
        if (node.type === "threat") threats++;
        if (node.type === "energy") energy++;
        if (node.type === "counter") counter = true;
      }
    }

    return { hitNodes, hitsForbidden, scores: { threats, energy, counter } };
  }

  // ================================================================
  // 执行挥刀
  // ================================================================

  resolveSlash(a: Vec2, b: Vec2): FormationCollisionEvent[] {
    const events: FormationCollisionEvent[] = [];
    const activeNodes = this.getAllActiveNodes();

    // 按世界Y排序（从上到下命中）
    const hit = activeNodes
      .filter(n => this.pointInSegment(a, b, n))
      .sort((a, b) => a.worldY - b.worldY);

    for (const node of hit) {
      const pos = { x: node.worldX, y: node.worldY };
      node.active = false;

      if (node.type === "threat") {
        events.push({ kind: "threat_destroyed", nodeId: node.id, position: pos });
      } else if (node.type === "energy") {
        events.push({ kind: "energy_collected", nodeId: node.id, position: pos });
      } else if (node.type === "counter") {
        // 刀势门槛由 Game.ts 判断
        events.push({ kind: "counter_hit", nodeId: node.id, position: pos });
      } else if (node.type === "forbidden") {
        events.push({ kind: "forbidden_hit", nodeId: node.id, position: pos });
        // 禁斩节点不消失（持续挡路）
        node.active = true;
      }
    }

    // 检查是否完整清除了一条 threat_chain → 小破绽
    const chainCleared = this.checkThreatChainCleared();
    if (chainCleared) {
      this._windowType = "small";
      this._windowTimer = 0;
    }

    return events;
  }

  /** 反射：当前阵列所有剩余威胁节点清除 → 大破绽 */
  reflectCounter(): FormationCollisionEvent[] {
    const events: FormationCollisionEvent[] = [];
    for (const fm of this._formations) {
      if (!fm.active) continue;
      const hasCounter = fm.nodes.some(n => n.type === "counter" && n.active);
      if (!hasCounter) continue;

      // 清除同阵列所有威胁
      for (const node of fm.nodes) {
        if (node.type === "threat" && node.active) {
          node.active = false;
          events.push({
            kind: "threat_destroyed",
            nodeId: node.id,
            position: { x: node.worldX, y: node.worldY },
          });
        }
      }
    }

    // 大破绽
    this._windowType = "large";
    this._windowTimer = 0;
    events.push({
      kind: "counter_reflected",
      nodeId: "counter",
      position: { x: 195, y: 500 },
    });
    return events;
  }

  // ================================================================
  // 帮助方法
  // ================================================================

  private getAllActiveNodes(): FormationRuntimeNode[] {
    const result: FormationRuntimeNode[] = [];
    for (const fm of this._formations) {
      for (const node of fm.nodes) {
        if (node.active) result.push(node);
      }
    }
    return result;
  }

  private pointInSegment(a: Vec2, b: Vec2, node: FormationRuntimeNode): boolean {
    const px = node.worldX, py = node.worldY, r = node.radius + 6;
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.hypot(px - a.x, py - a.y) <= r;

    let t = ((px - a.x) * abx + (py - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const closestX = a.x + t * abx;
    const closestY = a.y + t * aby;
    return Math.hypot(px - closestX, py - closestY) <= r;
  }

  private checkThreatChainCleared(): boolean {
    for (const fm of this._formations) {
      if (!fm.active) continue;
      const threatNodes = fm.nodes.filter(n => n.type === "threat");
      if (threatNodes.length > 0 && threatNodes.every(n => !n.active)) {
        return true; // 整个阵列的威胁已被清除
      }
    }
    return false;
  }

  // ================================================================
  // 遥测导出
  // ================================================================

  get snapshot(): FormationSnapshot {
    const hasCounterOpp = this._formations.some(fm =>
      fm.nodes.some(n => n.type === "counter" && n.active)
    );
    return {
      phase: this._completed ? "complete" : "active",
      elapsed: this._elapsed,
      formations: this._formations,
      energy: this._energy,
      hp: this._hp,
      hasCounterOpp,
      counterReady: this._energy >= FORMATION_CONFIG.bladeEconomy.counterThreshold,
      windowType: this._windowType,
      windowTimer: this._windowTimer,
    };
  }
}
