/// <reference types="vite/client" />

// 由 vite define 注入（见 vite.config.ts）：
//   e2e 构建模式 → true；其余（含生产 production）→ false。
// 生产构建下 Game.ts 的 if(__E2E_BRIDGE__) 被静态消除，E2E 适配器模块不进入生产包。
declare const __E2E_BRIDGE__: boolean;
