/** P4.4A.2: 玄甲雷将首页预览 */
export function ThunderGeneralPreview() {
  return (
    <div
      className="thunder-general-preview"
      data-testid="thunder-general-preview"
      aria-label="玄甲雷将预览"
    >
      <div className="tg-preview-vignette" />
      <div className="tg-preview-lightning tg-preview-lightning-left" />
      <div className="tg-preview-lightning tg-preview-lightning-right" />

      <div className="tg-preview-boss">
        <div className="tg-preview-plume" />
        <div className="tg-preview-helmet" />
        <div className="tg-preview-shoulder left" />
        <div className="tg-preview-shoulder right" />
        <div className="tg-preview-body" />
        <div className="tg-preview-core" />
        <div className="tg-preview-skirt" />
      </div>

      <div className="tg-preview-label">境界镇守者</div>
      <div className="tg-preview-name">玄甲雷将</div>
    </div>
  );
}
