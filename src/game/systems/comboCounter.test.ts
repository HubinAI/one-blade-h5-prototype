import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
const m=()=>new Game(LEVELS[0],(()=>{}) as any);
describe('实时连击',()=>{
  it('单次命中 → combo=1',()=>{
    const g=m();
    (g as any).emitDamageFloat(100,100,200,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(1);
  });
  it('连续 3 次命中 → combo=3',()=>{
    const g=m();
    for(let i=0;i<3;i++) (g as any).emitDamageFloat(100,100,200+i*40,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(3);
  });
  it('副刀不增加连击',()=>{
    const g=m();
    (g as any).emitDamageFloat(100,100,200,300,'NORMAL',false,{sourceType:'SUB_BLADE'});
    expect((g as any)._comboCount).toBe(0);
  });
  it('断连 1.2 秒后清零',async ()=>{
    const g=m();
    (g as any).emitDamageFloat(100,100,200,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(1);
    await new Promise(r=>setTimeout(r,1300));
    // 需要手动推进断连计时器
    (g as any)._updateComboPresentation(1.3);
    expect((g as any)._comboCount).toBe(0);
  });
});
