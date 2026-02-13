import React from 'react';

export type LayoutDebugCopyStatus = 'idle' | 'copied' | 'error';

type LayoutDebugPanelProps = {
  visible: boolean;
  minAspect?: number;
  maxAspect?: number;
  spacerAspect: number;
  minScaleMultiplier?: number;
  maxScaleMultiplier?: number;
  scaleMultiplierStep?: number;
  nineSliceScaleMultiplier: number;
  minPaddingMultiplier?: number;
  maxPaddingMultiplier?: number;
  paddingMultiplierStep?: number;
  boardPaddingMultiplier: number;
  minPowerupSizeMultiplier?: number;
  maxPowerupSizeMultiplier?: number;
  powerupSizeMultiplierStep?: number;
  powerupSizeMultiplier: number;
  minPowerupBubbleSizeMultiplier?: number;
  maxPowerupBubbleSizeMultiplier?: number;
  powerupBubbleSizeMultiplierStep?: number;
  powerupBubbleSizeMultiplier: number;
  minPowerupGapMultiplier?: number;
  maxPowerupGapMultiplier?: number;
  powerupGapMultiplierStep?: number;
  powerupGapMultiplier: number;
  copyStatus: LayoutDebugCopyStatus;
  debugText: string;
  onChangeSpacerAspect: (value: number) => void;
  onChangeNineSliceScaleMultiplier: (value: number) => void;
  onChangeBoardPaddingMultiplier: (value: number) => void;
  onChangePowerupSizeMultiplier: (value: number) => void;
  onChangePowerupBubbleSizeMultiplier: (value: number) => void;
  onChangePowerupGapMultiplier: (value: number) => void;
  onCopy: () => void;
  onReset: () => void;
  onHide: () => void;
};

export const LayoutDebugPanel: React.FC<LayoutDebugPanelProps> = ({
  visible,
  minAspect = 8,
  maxAspect = 80,
  spacerAspect,
  minScaleMultiplier = 0.6,
  maxScaleMultiplier = 3,
  scaleMultiplierStep = 0.01,
  nineSliceScaleMultiplier,
  minPaddingMultiplier = 0.5,
  maxPaddingMultiplier = 4,
  paddingMultiplierStep = 0.01,
  boardPaddingMultiplier,
  minPowerupSizeMultiplier = 0.5,
  maxPowerupSizeMultiplier = 2,
  powerupSizeMultiplierStep = 0.01,
  powerupSizeMultiplier,
  minPowerupBubbleSizeMultiplier = 0.5,
  maxPowerupBubbleSizeMultiplier = 2,
  powerupBubbleSizeMultiplierStep = 0.01,
  powerupBubbleSizeMultiplier,
  minPowerupGapMultiplier = 0.5,
  maxPowerupGapMultiplier = 2,
  powerupGapMultiplierStep = 0.01,
  powerupGapMultiplier,
  copyStatus,
  debugText,
  onChangeSpacerAspect,
  onChangeNineSliceScaleMultiplier,
  onChangeBoardPaddingMultiplier,
  onChangePowerupSizeMultiplier,
  onChangePowerupBubbleSizeMultiplier,
  onChangePowerupGapMultiplier,
  onCopy,
  onReset,
  onHide,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed top-3 right-3 z-[230] w-[360px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-300/35 bg-slate-950 p-3 text-white shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black tracking-wide">Layout Debug</h3>
        <button
          onClick={onHide}
          className="rounded-md border border-white/35 bg-white/16 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-white/24"
        >
          Minimize
        </button>
      </div>

      <div className="mb-3 space-y-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-300">
            Spacer Separation (global)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minAspect}
              max={maxAspect}
              step={1}
              value={spacerAspect}
              onChange={(event) => onChangeSpacerAspect(Number(event.target.value))}
              className="w-full"
            />
            <input
              type="number"
              min={minAspect}
              max={maxAspect}
              step={1}
              value={spacerAspect}
              onChange={(event) => onChangeSpacerAspect(Number(event.target.value))}
              className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Higher value = more gap between sections</p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-300">
            NineSlice Scale Multiplier
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minScaleMultiplier}
              max={maxScaleMultiplier}
              step={scaleMultiplierStep}
              value={nineSliceScaleMultiplier}
              onChange={(event) => onChangeNineSliceScaleMultiplier(Number(event.target.value))}
              className="w-full"
            />
            <input
              type="number"
              min={minScaleMultiplier}
              max={maxScaleMultiplier}
              step={scaleMultiplierStep}
              value={nineSliceScaleMultiplier}
              onChange={(event) => onChangeNineSliceScaleMultiplier(Number(event.target.value))}
              className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-slate-300">
            Board Padding Multiplier
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minPaddingMultiplier}
              max={maxPaddingMultiplier}
              step={paddingMultiplierStep}
              value={boardPaddingMultiplier}
              onChange={(event) => onChangeBoardPaddingMultiplier(Number(event.target.value))}
              className="w-full"
            />
            <input
              type="number"
              min={minPaddingMultiplier}
              max={maxPaddingMultiplier}
              step={paddingMultiplierStep}
              value={boardPaddingMultiplier}
              onChange={(event) => onChangeBoardPaddingMultiplier(Number(event.target.value))}
              className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
            />
          </div>
        </div>

        <details className="rounded-md border border-slate-700 bg-slate-900/40">
          <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold text-slate-200">
            Powerups
          </summary>
          <div className="space-y-2 px-2 pb-2 pt-1">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                Powerup Size Multiplier
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={minPowerupSizeMultiplier}
                  max={maxPowerupSizeMultiplier}
                  step={powerupSizeMultiplierStep}
                  value={powerupSizeMultiplier}
                  onChange={(event) => onChangePowerupSizeMultiplier(Number(event.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={minPowerupSizeMultiplier}
                  max={maxPowerupSizeMultiplier}
                  step={powerupSizeMultiplierStep}
                  value={powerupSizeMultiplier}
                  onChange={(event) => onChangePowerupSizeMultiplier(Number(event.target.value))}
                  className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                Bubble Size Multiplier
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={minPowerupBubbleSizeMultiplier}
                  max={maxPowerupBubbleSizeMultiplier}
                  step={powerupBubbleSizeMultiplierStep}
                  value={powerupBubbleSizeMultiplier}
                  onChange={(event) => onChangePowerupBubbleSizeMultiplier(Number(event.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={minPowerupBubbleSizeMultiplier}
                  max={maxPowerupBubbleSizeMultiplier}
                  step={powerupBubbleSizeMultiplierStep}
                  value={powerupBubbleSizeMultiplier}
                  onChange={(event) => onChangePowerupBubbleSizeMultiplier(Number(event.target.value))}
                  className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                Powerup Horizontal Gap Multiplier
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={minPowerupGapMultiplier}
                  max={maxPowerupGapMultiplier}
                  step={powerupGapMultiplierStep}
                  value={powerupGapMultiplier}
                  onChange={(event) => onChangePowerupGapMultiplier(Number(event.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={minPowerupGapMultiplier}
                  max={maxPowerupGapMultiplier}
                  step={powerupGapMultiplierStep}
                  value={powerupGapMultiplier}
                  onChange={(event) => onChangePowerupGapMultiplier(Number(event.target.value))}
                  className="w-16 rounded-md border border-slate-500 bg-slate-900 px-1.5 py-1 text-right text-xs"
                />
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={onCopy}
          className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-black hover:bg-cyan-500"
        >
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy Error' : 'Copy Debug JSON'}
        </button>
        <button
          onClick={onReset}
          className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold hover:bg-slate-600"
        >
          Reset
        </button>
      </div>

      <textarea
        readOnly
        value={debugText}
        className="h-40 w-full resize-y rounded-md border border-slate-500/50 bg-slate-900/80 p-2 font-mono text-[10px] leading-4 text-slate-200"
      />
      <p className="mt-2 text-[10px] text-slate-400">
        Toggle: <code>Ctrl/Cmd+Shift+L</code> or <code>?layoutDebug=1</code>
      </p>
    </div>
  );
};

export default LayoutDebugPanel;
