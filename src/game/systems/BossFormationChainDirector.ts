// ========================================================================
// S4: BossFormationChainDirector — 图遍历断链逻辑
// ========================================================================
import {
  CHAIN_CONFIG,
  type Vec2,
  type ChainTemplate,
  type FormationChainRuntime,
  type ChainRuntimeNode,
  type ChainRuntimeEdge,
  type ChainCollisionEvent,
  type ChainSlashPreview,
  type FormationChainSnapshot,
} from "../config/bossFormationChain";
import { getChainTemplateByPhase } from "./formationChainTemplates";

export class BossFormationChainDirector {
  private _chains: FormationChainRuntime[] = [];
  private _elapsed = 0;
  private _nextSpawnAt = 0;
  private _seq = 0;
  private _phase: 1 | 2 | 3 = 1;
  private _energy = CHAIN_CONFIG.bladeEconomy.initial;
  private _hp = CHAIN_CONFIG.playerMaxHp;
  private _windowType: "none" | "small" | "large" = "none";
  private _windowTimer = 0;
  private _completed = false;
  private _random: () => number;

  constructor() {
    let s = 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  setSeed(n: number) {
    let s = n || 42;
    this._random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  get completed(): boolean { return this._completed; }
  get phase(): 1 | 2 | 3 { return this._phase; }

  // ================================================================
  // 主更新
  // ================================================================

  update(dt: number, energy?: number, hp?: number): void {
    if (this._completed) return;
    this._elapsed += dt;
    if (energy !== undefined) this._energy = energy;
    if (hp !== undefined) this._hp = hp;

    // 阶段推进
    if (this._elapsed >= CHAIN_CONFIG.phase2End && this._phase < 3) this._phase = 3;
    else if (this._elapsed >= CHAIN_CONFIG.phase1End && this._phase < 2) this._phase = 2;

    // 破绽计时
    if (this._windowType !== "none") {
      this._windowTimer += dt;
      const maxDur = this._windowType === "large"
        ? CHAIN_CONFIG.windowLargeDuration
        : CHAIN_CONFIG.windowSmallDuration;
      if (this._windowTimer >= maxDur) { this._windowType = "none"; this._windowTimer = 0; }
    }

    // 生成新阵型
    const activeCount = this._chains.filter(c => c.nodes.some(n => n.active)).length;
    if (this._elapsed >= this._nextSpawnAt && activeCount < CHAIN_CONFIG.maxChains) {
      this.spawnChain();
    }

    // 移动所有阵型
    for (const chain of this._chains) {
      const dy = chain.velocityY * dt;
      chain.originY += dy;
      for (const node of chain.nodes) {
        if (!node.active) continue;
        node.worldY += dy;
        node.proximity = Math.max(0, Math.min(1,
          (node.worldY - CHAIN_CONFIG.spawnLineY) / (CHAIN_CONFIG.defenseLineY - CHAIN_CONFIG.spawnLineY)
        ));
      }
      // 更新 hull 世界坐标
      const template = getChainTemplateByPhase(this._phase, 0);
      if (template) {
        chain.hull = template.hull.map(p => ({ x: chain.originX + p.x, y: chain.originY + p.y }));
      }
    }

    // 清理已完成阵型
    this._chains = this._chains.filter(c => c.nodes.some(n => n.active && n.worldY < CHAIN_CONFIG.defenseLineY + 40));

    // 结束条件
    if (this._elapsed >= CHAIN_CONFIG.totalDuration && this._chains.length === 0) {
      this._completed = true;
    }
  }

  // ================================================================
  // 阵型生成
  // ================================================================

  private spawnChain(): void {
    const template = getChainTemplateByPhase(this._phase, this._seq);
    if (!template) return;

    const id = `sc_${this._seq}`;
    const originX = 160 + (this._seq % 3) * 40;
    const spawnY = CHAIN_CONFIG.spawnLineY + (this._seq > 0 ? -15 : 0);

    // 构建节点
    const nodeMap = new Map<string, ChainRuntimeNode>();
    const edgeMap = new Map<string, ChainRuntimeEdge>();
    const childrenOf = new Map<string, string[]>();

    for (const ndef of template.nodes) {
      const r = ndef.radius ?? CHAIN_CONFIG.nodeRadius[ndef.type];
      nodeMap.set(ndef.id, {
        id: `${id}_${ndef.id}`,
        type: ndef.type,
        worldX: originX + ndef.position.x,
        worldY: spawnY + ndef.position.y,
        radius: r,
        active: true,
        proximity: 0,
      });
      childrenOf.set(ndef.id, []);
    }

    // 构建边和父子关系
    for (const edef of template.edges) {
      const fromId = `${id}_${edef.from}`;
      const toId = `${id}_${edef.to}`;
      edgeMap.set(edef.id, {
        id: `${id}_${edef.id}`,
        fromId,
        toId,
        kind: edef.kind,
        active: true,
      });
      const children = childrenOf.get(fromId) ?? [];
      children.push(toId);
      childrenOf.set(fromId, children);
    }

    const chain: FormationChainRuntime = {
      id,
      templateId: template.id,
      originX,
      originY: spawnY,
      velocityY: CHAIN_CONFIG.chainSpeed,
      spawnedAt: this._elapsed,
      hull: template.hull.map(p => ({ x: originX + p.x, y: spawnY + p.y })),
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
      nodeMap,
      edgeMap,
      childrenOf,
    };

    this._chains.push(chain);
    this._nextSpawnAt = this._elapsed + CHAIN_CONFIG.chainInterval;
    this._seq++;
  }

  // ================================================================
  // 防线检测
  // ================================================================

  checkDefenseLine(): ChainCollisionEvent[] {
    const events: ChainCollisionEvent[] = [];
    for (const chain of this._chains) {
      for (const node of chain.nodes) {
        if (!node.active) continue;
        if (node.type === "threat" && node.worldY >= CHAIN_CONFIG.defenseLineY) {
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
  // 图遍历：获取节点所有下游子节点（BFS）
  // ================================================================

  private getDescendants(chain: FormationChainRuntime, nodeId: string): string[] {
    const result: string[] = [];
    const queue = [...(chain.childrenOf.get(nodeId) ?? [])];
    while (queue.length > 0) {
      const childId = queue.shift()!;
      result.push(childId);
      queue.push(...(chain.childrenOf.get(childId) ?? []));
    }
    return result;
  }

  // ================================================================
  // 挥刀预览
  // ================================================================

  previewSlash(a: Vec2, b: Vec2): ChainSlashPreview {
    const hitNodeIds: string[] = [];
    const cascadeIds: string[] = [];
    let hitArmor = false;
    let totalThreatsCleared = 0;
    let hitCore = false;

    for (const chain of this._chains) {
      // 先检查是否穿过甲链边
      for (const edge of chain.edges) {
        if (!edge.active || edge.kind !== "armor") continue;
        const fromN = chain.nodeMap.get(edge.fromId);
        const toN = chain.nodeMap.get(edge.toId);
        if (fromN && toN && fromN.active && toN.active) {
          if (this.doesSegmentCrossEdge(a, b, fromN, toN)) {
            hitArmor = true;
          }
        }
      }

      // 检查节点命中（考虑甲链阻挡：从命中点开始，到碰到的第一个甲链之后的不算）
      let blocked = false;
      for (const node of chain.nodes) {
        if (!node.active) continue;
        if (this.pointInSegment(a, b, node)) {
          if (hitArmor && blocked) continue; // 甲链后无效
          hitNodeIds.push(node.id);

          if (node.type === "core") {
            hitCore = true;
            // 命核命中：检查是否可反卷
            totalThreatsCleared = CHAIN_CONFIG.bladeEconomy.coreThreshold;
          } else {
            // 非核节点：获取下游
            const descendants = this.getDescendants(chain, node.id);
            for (const did of descendants) {
              const dn = chain.nodeMap.get(did);
              if (dn && dn.active && dn.type === "threat") {
                cascadeIds.push(did);
                totalThreatsCleared++;
              }
            }
            if (node.type === "threat") totalThreatsCleared++;
          }

          // 碰到甲链起始节点，后续节点被阻挡
          for (const edge of chain.edges) {
            if (edge.kind === "armor" && edge.fromId === node.id && edge.active) {
              blocked = true;
            }
          }
        }
      }
    }

    return {
      hitNodeIds,
      cascadeNodeIds: cascadeIds,
      hitArmor,
      totalThreatsCleared,
      hitCore,
      coreReady: this._energy >= CHAIN_CONFIG.bladeEconomy.coreThreshold,
    };
  }

  // ================================================================
  // 执行挥刀
  // ================================================================

  resolveSlash(a: Vec2, b: Vec2): ChainCollisionEvent[] {
    const events: ChainCollisionEvent[] = [];
    let hitArmorForResolve = false;

    for (const chain of this._chains) {
      // 检查甲链弹刀
      for (const edge of chain.edges) {
        if (!edge.active || edge.kind !== "armor") continue;
        const fromN = chain.nodeMap.get(edge.fromId);
        const toN = chain.nodeMap.get(edge.toId);
        if (fromN && toN && fromN.active && toN.active) {
          if (this.doesSegmentCrossEdge(a, b, fromN, toN)) {
            hitArmorForResolve = true;
            events.push({
              kind: "armor_bounce",
              nodeId: edge.id,
              position: { x: (fromN.worldX + toN.worldX) / 2, y: (fromN.worldY + toN.worldY) / 2 },
            });
          }
        }
      }

      // 按从上到下顺序命中
      const hitNodes = chain.nodes
        .filter(n => n.active && this.pointInSegment(a, b, n))
        .sort((a, b) => a.worldY - b.worldY);

      let blocked = hitArmorForResolve;
      for (const node of hitNodes) {
        if (blocked) continue; // 甲链阻挡
        const pos = { x: node.worldX, y: node.worldY };

        if (node.type === "core") {
          // 命核命中
          events.push({ kind: "core_hit", nodeId: node.id, position: pos });
          if (this._energy >= CHAIN_CONFIG.bladeEconomy.coreThreshold) {
            // 反卷！
            this.reflectChain(chain, events);
          }
        } else if (node.type === "joint") {
          // 断关节 → 整条下游失效
          node.active = false;
          events.push({ kind: "joint_broken", nodeId: node.id, position: pos });
          const cascadeIds = this.cascadeBranch(chain, node.id);
          for (const cid of cascadeIds) {
            events.push({
              kind: "joint_casacde",
              nodeId: cid,
              position: { x: pos.x, y: pos.y },
            });
          }
        } else if (node.type === "threat") {
          // 直接斩红刃
          node.active = false;
          events.push({ kind: "threat_destroyed", nodeId: node.id, position: pos });
        }

        // 甲链起始节点 → 阻挡后续
        for (const edge of chain.edges) {
          if (edge.kind === "armor" && edge.fromId === node.id && edge.active) {
            blocked = true;
          }
        }
      }
    }

    // 检查小破绽：一个阵型的红刃全灭
    const chainCleared = this.checkChainCleared();
    if (chainCleared) {
      this._windowType = "small";
      this._windowTimer = 0;
    }

    return events;
  }

  // ================================================================
  // 下游分支级联失效
  // ================================================================

  private cascadeBranch(chain: FormationChainRuntime, rootId: string): string[] {
    const cascadeIds: string[] = [];
    const descIds = this.getDescendants(chain, rootId);
    for (const did of descIds) {
      const dn = chain.nodeMap.get(did);
      if (dn && dn.active) {
        dn.active = false;
        cascadeIds.push(did);
      }
    }
    return cascadeIds;
  }

  // ================================================================
  // 命核反卷
  // ================================================================

  private reflectChain(chain: FormationChainRuntime, events: ChainCollisionEvent[]): void {
    // 清除阵型中所��活跃红刃
    for (const node of chain.nodes) {
      if (!node.active) continue;
      if (node.type === "threat") {
        node.active = false;
        events.push({
          kind: "threat_destroyed",
          nodeId: node.id,
          position: { x: node.worldX, y: node.worldY },
        });
      }
    }
    // 大破绽
    this._windowType = "large";
    this._windowTimer = 0;
    events.push({
      kind: "core_reflected",
      nodeId: "core",
      position: { x: CHAIN_CONFIG.playerPos.x, y: 500 },
    });
  }

  // ================================================================
  // 帮助方法
  // ================================================================

  private pointInSegment(a: Vec2, b: Vec2, node: ChainRuntimeNode): boolean {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.hypot(node.worldX - a.x, node.worldY - a.y) <= node.radius + 4;
    let t = ((node.worldX - a.x) * abx + (node.worldY - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * abx, cy = a.y + t * aby;
    return Math.hypot(node.worldX - cx, node.worldY - cy) <= node.radius + 4;
  }

  /** 判断线段是否穿过两个节点之间的甲链区域 */
  private doesSegmentCrossEdge(a: Vec2, b: Vec2, from: ChainRuntimeNode, to: ChainRuntimeNode): boolean {
    // 简化：检查线段是否靠近两个节点连线的中点（甲链的核心路径）
    const midX = (from.worldX + to.worldX) / 2;
    const midY = (from.worldY + to.worldY) / 2;
    // 计算线段到中点的距离
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.hypot(midX - a.x, midY - a.y) <= 30;
    let t = ((midX - a.x) * abx + (midY - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * abx, cy = a.y + t * aby;
    return Math.hypot(midX - cx, midY - cy) <= 30;
  }

  private checkChainCleared(): boolean {
    for (const chain of this._chains) {
      const threats = chain.nodes.filter(n => n.type === "threat");
      if (threats.length > 0 && threats.every(n => !n.active)) return true;
    }
    return false;
  }

  // ================================================================
  // 快照
  // ================================================================

  get snapshot(): FormationChainSnapshot {
    return {
      elapsed: this._elapsed,
      chains: this._chains,
      energy: this._energy,
      hp: this._hp,
      coreReady: this._energy >= CHAIN_CONFIG.bladeEconomy.coreThreshold,
      windowType: this._windowType,
      windowTimer: this._windowTimer,
      phase: this._phase,
    };
  }
}
