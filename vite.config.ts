import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// E2E 桥开关：仅 e2e 构建模式开启。
// __E2E_BRIDGE__ 注入为字面量布尔，esbuild 在生产构建下将
// Game.ts 的 if(false){ ... } 整段静态消除（含内部 forceArmorHit/forcePursuitHit 闭包），
// 使 E2E 桥与强制命中逻辑均不进入生产包（审计六：生产包零 E2E 残留）。
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  define: {
    // 直接注入布尔字面量 true/false（勿用 JSON.stringify，否则会变成字符串 "false" 仍为 truthy）
    __E2E_BRIDGE__: mode === "e2e" ? "true" : "false",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
}));
