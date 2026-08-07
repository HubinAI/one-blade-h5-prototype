/**
 * 0807-11D-2 导演测试 (总量/档位/元数据)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PostEdictDirector, BEATS, PHASES, STANDARD_SLASH_DAMAGE, HP_TIERS, postEdictDirector } from './PostEdictDirector';

const tick = (d: PostEdictDirector, dt=0.016, aliveInZone=0, aliveTotal=0, approachingCount=0, queueLen=0, elapsedMs=0, beatS=0, beatA=0, beatC=0, beatAlive=0) =>
  d.tick(dt, aliveInZone, aliveTotal, approachingCount, queueLen, elapsedMs, beatS, beatA, beatC, beatAlive);

describe('总量与档位', () => {
  it('P1=36 P2=56 P3=72 total=164', () => {
    expect(PHASES.P1.totalEnemies).toBe(36);
    expect(PHASES.P2.totalEnemies).toBe(56);
    expect(PHASES.P3.totalEnemies).toBe(72);
    expect(36+56+72).toBe(164);
  });

  it('P1=3beat P2=5beat P3=6beat', () => {
    expect(BEATS.filter(b=>b.phase==='P1').length).toBe(3);
    expect(BEATS.filter(b=>b.phase==='P2').length).toBe(5);
    expect(BEATS.filter(b=>b.phase==='P3').length).toBe(6);
  });

  it('D=125', () => { expect(STANDARD_SLASH_DAMAGE).toBe(125); });
  it('杂兵100 一刀', () => { expect(HP_TIERS.trash.hp).toBe(100); expect(125>=100).toBe(true); });
  it('韧兵170 两刀', () => { expect(HP_TIERS.tough.hp).toBe(170); expect(250>=170).toBe(true); });
  it('压阵260 三刀', () => { expect(HP_TIERS.elite_wall.hp).toBe(260); expect(375>=260).toBe(true); });
});

describe('测试总量精确 164 (84+68+12)', () => {
  it('精确生成所有敌人', () => {
    const d = new PostEdictDirector(); d.start();
    let trash=0, tough=0, wall=0, total=0, ms=0;
    for (let i=0; i<5000; i++) { ms+=500; const reqs=tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0); for(const r of reqs) for(const item of r.items) { total++; if(item.hpTier==='trash') trash++; else if(item.hpTier==='tough') tough++; else wall++; } if(!d.active&&d.allComplete) break; }
    expect(total).toBe(164);
    expect(trash).toBe(84);
    expect(tough).toBe(68);
    expect(wall).toBe(12);
  });

  it('rapidPulse HP档位正确(trash=100,tough=170,wall=260,splitter=170)', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          // P3 rapidPulse: splitter=170, trash=100, tough=170, wall=260
          expect(item.hpOverride).toBeGreaterThan(0);
          if (item.enemyKind === 'splitter') {
            expect(item.hpTier).toBe('tough');
            expect(item.hpOverride).toBe(170);
          } else if (item.hpTier === 'trash') {
            expect(item.hpOverride).toBe(100);
          } else if (item.hpTier === 'tough') {
            expect(item.hpOverride).toBe(170);
          } else if (item.hpTier === 'elite_wall') {
            expect(item.hpOverride).toBe(260);
          }
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });
});

describe('基础生命周期', () => {
  it('start/reset', () => {
    const d=new PostEdictDirector();
    d.start(); expect(d.active).toBe(true); expect(d.currentPhase).toBe('P1');
    d.reset(); expect(d.active).toBe(false);
  });
  it('complete → canSpawnElite', () => {
    const d=new PostEdictDirector(); d.start(); let ms=0;
    for(let i=0;i<3000;i++){ms+=16;tick(d,0.016,0,0,0,0,ms,0,0,0,0);if(!d.active&&d.allComplete)break;}
    expect(d.canSpawnElite()).toBe(true);
  });
});

describe('元数据贯通', () => {
  it('SpawnItem 包含 directorPhase/BeatId/MbId/hpTier/formationId', () => {
    const d=new PostEdictDirector(); d.start();
    const reqs=tick(d,0.016,0,0,0,0,0,0,0,0,0);
    expect(reqs.length).toBeGreaterThan(0);
    const item=reqs[0].items[0];
    expect(item.directorPhase).toBe('P1');
    expect(item.directorBeatId).toBe('P1-1');
    expect(item.directorMicroBatchId).toContain('mb');
    expect(item.hpTier).toBe('trash');
    expect(item.formationId).toBeTruthy();
    expect(item.entryTargetX).toBeGreaterThan(0);
  });
});

describe('桥接保留档位', () => {
  it('桥接不替换 hpTier/formationId', () => {
    const d=new PostEdictDirector(); d.start();
    let ms=0;
    // 运行直到桥接触发 (elapsed > notBefore)
    for(let i=0;i<2000;i++){ms+=50;const reqs=tick(d,0.05,0,0,0,0,ms,0,0,0,0);for(const r of reqs){for(const item of r.items){if(r.consumedMicroBatchId){expect(item.hpTier).toBeDefined();expect(item.formationId).toBeTruthy();}}}}
  });
});

describe('0807-11D-6F-4 引信与爆炸', () => {
  it('火药兵生成后有enemyKind=powder', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0; let foundPowder = false;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') { foundPowder = true; expect(item.hpTier).toBe('tough'); }
        }
      }
      if (!d.active && d.allComplete) break;
    }
    expect(foundPowder).toBe(true);
  });

  it('火药兵总数=3', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0; let powderCount = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') powderCount++;
        }
      }
      if (!d.active && d.allComplete) break;
    }
    expect(powderCount).toBe(3);
  });

  it('火药兵spawnInPlace=true', () => {
    const d = new PostEdictDirector(); d.start();
    let ms = 0;
    for (let i = 0; i < 5000; i++) {
      ms += 500;
      const reqs = tick(d, 0.5, 0, 0, 0, 0, ms, 0, 0, 0, 0);
      for (const r of reqs) {
        for (const item of r.items) {
          if (item.enemyKind === 'powder') expect(item.spawnInPlace).toBe(true);
        }
      }
      if (!d.active && d.allComplete) break;
    }
  });
});
