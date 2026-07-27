type PauseOverlayProps = {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
};

export function PauseOverlay({ onResume, onRestart, onQuit }: PauseOverlayProps) {
  return (
    <div className="pause-overlay">
      <div className="pause-panel">
        <strong>战斗暂停</strong>
        <p>敌军已止步，随时可再战</p>
        <div className="pause-actions">
          <button className="primary-button" onClick={onResume}>
            继续战斗
          </button>
          <button className="ghost-button" onClick={onRestart}>
            重新开始
          </button>
          <button className="text-button" onClick={onQuit}>
            退出关卡
          </button>
        </div>
      </div>
    </div>
  );
}
