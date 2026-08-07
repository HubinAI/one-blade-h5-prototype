import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
const m=()=>new Game(LEVELS[0],(()=>{}) as any);
describe('多斩飘字',()=>{
  it('3 目标→texts中存在damage飘字',()=>{
    const g=m();
    for(let i=0;i<3;i++) (g as any).emitDamageFloat(100,100,200+i*60,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(3);
    // 验证texts中存在category=damage的条目
    const texts = (g as any).texts || [];
    const dmgTexts = texts.filter((t:any) => t.category === 'damage');
    expect(dmgTexts.length).toBe(3);
  });
  it('6+目标→普通上限6个damage',()=>{
    const g=m();
    for(let i=0;i<8;i++) (g as any).emitDamageFloat(100,100,200+i*40,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(8);
    const dmgTexts = ((g as any).texts || []).filter((t:any) => t.category === 'damage');
    expect(dmgTexts.length).toBe(6);
  });
  it('精英独立数字(不受6上限)',()=>{
    const g=m();
    for(let i=0;i<7;i++) (g as any).emitDamageFloat(100,100,200,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    (g as any).emitDamageFloat(200,100,200,300,'ELITE',false,{sourceType:'MAIN_SLASH'});
    const dmgTexts = ((g as any).texts || []).filter((t:any) => t.category === 'damage');
    expect(dmgTexts.length).toBe(7); // 6普通+1精英
  });
});
