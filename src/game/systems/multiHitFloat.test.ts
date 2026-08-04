import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
const m = () => new Game(LEVELS[0], (()=>{}) as any);
describe('多斩飘字', () => {
  it('3 目标 → buffer+burst', async () => {
    const g = m();
    for(let i=0;i<3;i++) (g as any).emitDamageFloat(100,100,200+i*60,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._currentMainSlashHits.length).toBe(3);
    await new Promise(r=>setTimeout(r,150));
    expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });
  it('6 目标 → 2 组 + combo', async () => {
    const g=m();
    for(let i=0;i<6;i++) (g as any).emitDamageFloat(100,100,200+i*40,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    await new Promise(r=>setTimeout(r,250));
    expect((g as any)._burstTimers.length).toBeGreaterThanOrEqual(3);
  });
  it('已死亡位置保留', async () => {
    const g=m();
    (g as any).emitDamageFloat(100,100,200,300,'NORMAL',true,{sourceType:'MAIN_SLASH'});
    await new Promise(r=>setTimeout(r,150));
    expect((g as any)._currentMainSlashHits).toEqual([]); // 清空后为 []
  });
});
