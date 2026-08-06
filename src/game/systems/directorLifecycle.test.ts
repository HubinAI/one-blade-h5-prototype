import { describe, it, expect } from 'vitest';
import { PostEdictDirector, BEATS } from './PostEdictDirector';

const tick = (d:PostEdictDirector, dt=0.016, alvZ=0, alvT=0, app=0, q=0, ms=0, bS=0, bA=0, bC=0, bAlive=0) =>
  d.tick(dt, alvZ, alvT, app, q, ms, bS, bA, bC, bAlive);

describe('生命周期 (11D-2)', () => {
  it('即时清场完成不无限循环', () => {
    const d=new PostEdictDirector(); d.start(); let ms=0;
    for(let i=0;i<5000;i++){ms+=500;tick(d,0.5,0,0,0,0,ms,0,0,0,0);if(!d.active&&d.allComplete)break;}
    expect(d.allComplete).toBe(true);
    expect(d.canSpawnElite()).toBe(true);
  });
  it('经过了 P1/P2/P3', () => {
    const d=new PostEdictDirector(); d.start();
    let had={P1:false,P2:false,P3:false}, ms=0;
    for(let i=0;i<3000;i++){ms+=16;tick(d,0.016,0,0,0,0,ms,0,0,0,0);const p=d.currentPhase;if(p) had[p]=true;if(!d.active)break;}
    expect(had.P1&&had.P2&&had.P3).toBe(true);
  });
  it('internalDelay 生效', () => {
    const d=new PostEdictDirector(); d.start();
    tick(d,0.016,0,0,0,0,0,0,0,0,0); // 生成 mb0
    const r2=tick(d,0.016,0,0,0,0,16,0,0,0,0); // 16ms < 300ms delay → 不生成
    expect(r2.length).toBe(0); // WAIT_INTERNAL
  });
  it('reset 后从头开始', () => {
    const d=new PostEdictDirector(); d.start();
    for(let i=0;i<100;i++) tick(d,0.016,0,0,0,0,i*16,0,0,0,0);
    d.reset(); d.start();
    expect(d.currentPhase).toBe('P1');
    expect(d.currentBeatId).toBe('P1-1');
  });
});
