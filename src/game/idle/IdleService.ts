/**
 * 0814-04A IdleService — 挂机业务独立模块
 * 配置读取 IDLE_CONFIG, unlockedFloor/quantityMultiplier 统一来源
 */
import { readProgress, writeProgress, grantBladeInstances } from "../services/ProgressionService";
import { getIdleConfig } from "../config/bladeGrowth";

export interface IdleSnapshot {
  unlocked: boolean;
  currentFloor: number;
  accumulatedSeconds: number;
  capSeconds: number;
  progressRatio: number;
  dropQuality: string;
  dropPerHour: number;
  pendingBladeCount: number;
  lastCollectAt: number;
  timeStr: string;
  fastIdleEnabled: boolean;
  fastIdleUsed: number;
  fastIdleLimit: number;
}

function getIdleParams(){const c=getIdleConfig();return{dropQuality:c.dropQuality??"white",baseDropPerHour:c.baseDropPerHour??2,capHours:c.capHours??24,quantityMultiplier:1.0,unlockedFloor:2,fastIdleLimit:4,fastIdleEnabled:false};}

function tick(progress:ReturnType<typeof readProgress>){const p=getIdleParams();if((progress.highestFloor??1)<p.unlockedFloor)return;const now=Date.now();const elapsed=Math.max(0,(now-(progress.lastIdleCollectAt??now))/1000);progress.idleAccumulatedSeconds=Math.min(p.capHours*3600,(progress.idleAccumulatedSeconds??0)+elapsed);progress.lastIdleCollectAt=now;}

export function getIdleSnapshot():IdleSnapshot{
  const progress=readProgress();
  tick(progress);
  const p=getIdleParams();
  const sec=progress.idleAccumulatedSeconds??0;
  const capSec=p.capHours*3600;
  const pending=Math.floor((sec/3600)*p.baseDropPerHour*p.quantityMultiplier);
  const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);
  return{unlocked:(progress.highestFloor??1)>=p.unlockedFloor,currentFloor:progress.highestFloor??1,accumulatedSeconds:sec,capSeconds:capSec,progressRatio:Math.min(100,Math.round((sec/capSec)*100)),dropQuality:p.dropQuality,dropPerHour:p.baseDropPerHour,pendingBladeCount:pending,lastCollectAt:progress.lastIdleCollectAt??Date.now(),timeStr:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,fastIdleEnabled:p.fastIdleEnabled,fastIdleUsed:0,fastIdleLimit:p.fastIdleLimit};}

export function claimIdleReward():{ok:boolean;quality?:string;count?:number;createdBladeIds?:string[];reason?:string}{
  const snap=getIdleSnapshot();if(!snap.unlocked)return{ok:false,reason:"挂机未解锁"};if(snap.pendingBladeCount<=0)return{ok:false,reason:"暂无奖励"};
  const result=grantBladeInstances(snap.dropQuality,snap.pendingBladeCount,"idle");
  const progress=readProgress();progress.idleAccumulatedSeconds=0;progress.lastIdleCollectAt=Date.now();writeProgress(progress);
  return{ok:true,quality:snap.dropQuality,count:snap.pendingBladeCount,createdBladeIds:result.instanceIds};}

export function debugSimulateIdleHours(hours:number):void{const p=getIdleParams();const progress=readProgress();progress.idleAccumulatedSeconds=Math.min(p.capHours*3600,(progress.idleAccumulatedSeconds??0)+hours*3600);writeProgress(progress);}
export function debugResetIdle():void{const progress=readProgress();progress.idleAccumulatedSeconds=0;progress.lastIdleCollectAt=Date.now();writeProgress(progress);}
