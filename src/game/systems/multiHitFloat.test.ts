import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { LEVELS } from '../../data/levels';
const m=()=>new Game(LEVELS[0],(()=>{}) as any);
describe('多斩飘字',()=>{
  it('3 目标→直接数字+combo更新',()=>{
    const g=m();
    for(let i=0;i<3;i++) (g as any).emitDamageFloat(100,100,200+i*60,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(3);
    expect((g as any)._mainDirectFloatCount).toBe(3); // 11E-1C: 直接计数
  });
  it('6+目标→最多6个直接数字',()=>{
    const g=m();
    for(let i=0;i<8;i++) (g as any).emitDamageFloat(100,100,200+i*40,300,'NORMAL',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._comboCount).toBe(8);
    expect((g as any)._mainDirectFloatCount).toBe(6); // 上限6
  });
  it('精英独立数字',()=>{
    const g=m();
    (g as any)._mainDirectFloatCount = 6;
    (g as any).emitDamageFloat(50,100,200,300,'ELITE',false,{sourceType:'MAIN_SLASH'});
    expect((g as any)._mainDirectFloatCount).toBe(6);
  });
});
