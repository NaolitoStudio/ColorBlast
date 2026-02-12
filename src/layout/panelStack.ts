const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type StackPanelSpec = {
  id: string;
  aspectRatio: number;
  widthRatio?: number;
};

export type StackPanelFrame = {
  id: string;
  width: number;
  height: number;
  widthRatio: number;
  heightRatio: number;
};

export type ProportionalStackLayout = {
  scale: number;
  totalHeight: number;
  frames: Record<string, StackPanelFrame>;
};

type SolveProportionalStackArgs = {
  containerWidth: number;
  availableHeight: number;
  gap: number;
  minScale?: number;
  maxScale?: number;
  panels: StackPanelSpec[];
};

/**
 * Resuelve un stack vertical de paneles manteniendo aspect-ratio fijo de cada uno.
 * Todos los paneles se escalan de forma uniforme para que el conjunto quepa
 * en la altura disponible.
 */
export const solveProportionalStack = ({
  containerWidth,
  availableHeight,
  gap,
  minScale = 0.35,
  maxScale = 1,
  panels,
}: SolveProportionalStackArgs): ProportionalStackLayout => {
  const safeWidth = Math.max(1, containerWidth);
  const safeGap = Math.max(0, gap);
  const safePanels = panels.filter(p => p.aspectRatio > 0);

  if (safePanels.length === 0) {
    return { scale: 1, totalHeight: 0, frames: {} };
  }

  const naturalTotalHeight = safePanels.reduce((acc, panel) => {
    const widthRatio = panel.widthRatio ?? 1;
    const panelWidth = safeWidth * widthRatio;
    return acc + (panelWidth / panel.aspectRatio);
  }, 0) + (safeGap * Math.max(0, safePanels.length - 1));

  const scale = clamp(
    Math.max(0, availableHeight) / Math.max(1, naturalTotalHeight),
    minScale,
    maxScale
  );

  const frames: Record<string, StackPanelFrame> = {};
  safePanels.forEach((panel) => {
    const baseWidthRatio = panel.widthRatio ?? 1;
    const width = safeWidth * baseWidthRatio * scale;
    const height = width / panel.aspectRatio;
    frames[panel.id] = {
      id: panel.id,
      width,
      height,
      widthRatio: baseWidthRatio * scale,
      heightRatio: height / safeWidth,
    };
  });

  const totalHeight = safePanels.reduce((acc, panel) => acc + (frames[panel.id]?.height ?? 0), 0)
    + (safeGap * Math.max(0, safePanels.length - 1));

  return {
    scale,
    totalHeight,
    frames,
  };
};
