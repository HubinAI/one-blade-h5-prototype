/** Image Asset Preloader — 美术资源加载管线 */
const ASSET_MANIFEST: Record<string, string> = {};
const imageCache = new Map<string, HTMLImageElement>();
let preloaded = false;
let preloadPromise: Promise<void> | null = null;

function loadImage(key: string, src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.set(key, img); resolve(); };
    img.onerror = () => { console.warn(`[Assets] 加载失败(回退): ${key}`); resolve(); };
    img.src = src;
  });
}

export function preloadAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  const entries = Object.entries(ASSET_MANIFEST);
  if (entries.length === 0) { preloaded = true; preloadPromise = Promise.resolve(); return preloadPromise; }
  preloadPromise = Promise.all(entries.map(([k, s]) => loadImage(k, s))).then(() => { preloaded = true; });
  return preloadPromise;
}

export function getImage(key: string): HTMLImageElement | null { return imageCache.get(key) ?? null; }
export function isPreloaded(): boolean { return preloaded; }

export function drawImageSafe(ctx: CanvasRenderingContext2D, key: string, dx: number, dy: number, dw?: number, dh?: number, fallback?: () => void): boolean {
  const img = imageCache.get(key);
  if (img) { dw !== undefined && dh !== undefined ? ctx.drawImage(img, dx, dy, dw, dh) : ctx.drawImage(img, dx, dy); return true; }
  fallback?.(); return false;
}