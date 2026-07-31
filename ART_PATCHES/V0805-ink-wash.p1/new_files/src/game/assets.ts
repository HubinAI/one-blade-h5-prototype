/**
 * Image Asset Preloader — 美术资源加载管线
 * V0731.004 | feature/v0805-ink-wash
 *
 * 全部美术资源走这里统一加载。失败自动回退到代码绘制，保证 CI / 弱网不炸。
 */
const ASSET_MANIFEST: Record<string, string> = {
  // 背景三层（等美术输出后替换路径）
  // bgFar:  "/images/bg/mountain-far.png",
  // bgMid:  "/images/bg/mountain-mid.png",
  // bgNear: "/images/bg/mountain-near.png",

  // UI 图标
  // logoTitle: "/images/ui/logo-title.svg",
  // sealBlade: "/images/ui/seal-blade.svg",
};

const imageCache = new Map<string, HTMLImageElement>();
let preloaded = false;
let preloadPromise: Promise<void> | null = null;

function loadImage(key: string, src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(key, img);
      resolve();
    };
    img.onerror = () => {
      console.warn(`[Assets] 加载失败 (回退代码绘制): ${key} ← ${src}`);
      resolve(); // 不抛异常，保证流程继续
    };
    img.src = src;
  });
}

/** 预加载全部美术资源。仅首次调用生效，重复调用直接返回同一个 Promise。 */
export function preloadAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  const entries = Object.entries(ASSET_MANIFEST);
  if (entries.length === 0) {
    preloaded = true;
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  preloadPromise = Promise.all(
    entries.map(([key, src]) => loadImage(key, src))
  ).then(() => {
    preloaded = true;
  });

  return preloadPromise;
}

/** 同步获取已缓存的图片。未加载返回 null，调用方应回退代码绘制。 */
export function getImage(key: string): HTMLImageElement | null {
  return imageCache.get(key) ?? null;
}

/** 所有资源是否已加载完成 */
export function isPreloaded(): boolean {
  return preloaded;
}

/** 在 Canvas 上绘制缓存图片，失败时回退到 fallback 函数 */
export function drawImageSafe(
  ctx: CanvasRenderingContext2D,
  key: string,
  dx: number,
  dy: number,
  dw?: number,
  dh?: number,
  fallback?: () => void
): boolean {
  const img = imageCache.get(key);
  if (img) {
    if (dw !== undefined && dh !== undefined) {
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, dx, dy);
    }
    return true;
  }
  fallback?.();
  return false;
}
