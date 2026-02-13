/**
 * Configuración de NineSlice para un panel/botón
 */
export interface NineSliceConfig {
  /** División horizontal (0-1), donde está el punto de estiramiento. Default: 0.5 */
  divisionX?: number;
  /** División vertical (0-1), donde está el punto de estiramiento. Default: 0.5 */
  divisionY?: number;

  /** Rango proporcional (0-1) que se estira horizontalmente. Default: 0.1 (10%) */
  rangeX?: number;
  /** Rango proporcional (0-1) que se estira verticalmente. Default: 0.1 (10%) */
  rangeY?: number;

  /** Offset proporcional (-1 a 1) desde el centro de división. Default: 0 */
  offsetX?: number;
  /** Offset proporcional (-1 a 1) desde el centro de división. Default: 0 */
  offsetY?: number;

  /** Escala de renderizado (trazos más gruesos sin cambiar tamaño). Default: 1 */
  scale?: number;

  /** Modo de escala para normalización visual entre densidades. Default: 'density' */
  scaleMode?: 'density' | 'none';

  /** Referencia de densidad para scaleMode='density'. Default: 2 */
  dprReference?: number;

  /** Límite inferior del factor de densidad. Default: 0.8 */
  dprMinFactor?: number;

  /** Límite superior del factor de densidad. Default: 1.25 */
  dprMaxFactor?: number;

  /** Modo de repetición del nine-slice. Default: 'round' */
  repeat?: 'round' | 'stretch' | 'repeat';

  /** Aspect ratio fijo (ancho/alto). Ej: 1 = cuadrado, 3 = 3:1. undefined = libre */
  aspectRatio?: number;
}

/**
 * Configuración de layout responsivo global por tema
 */
export interface ThemeLayoutConfig {
  /** Aspect ratio del espaciador entre header y board (más alto = menos espacio) */
  spacerHeaderBoardAspect?: number;
  /** Aspect ratio del espaciador entre board y rack (más alto = menos espacio) */
  spacerBoardRackAspect?: number;
  /** Valor por defecto del slider Spacer Separation del layout debug */
  layoutDebugSpacerAspect?: number;
  /** Valor por defecto del slider NineSlice Scale Multiplier del layout debug */
  layoutDebugNineSliceScaleMultiplier?: number;
  /** Valor por defecto del slider Board Padding Multiplier del layout debug */
  layoutDebugBoardPaddingMultiplier?: number;
  /** Valor por defecto del slider Powerup Size Multiplier del layout debug */
  layoutDebugPowerupSizeMultiplier?: number;
  /** Valor por defecto del slider Bubble Size Multiplier del layout debug */
  layoutDebugPowerupBubbleSizeMultiplier?: number;
  /** Valor por defecto del slider Powerup Horizontal Gap Multiplier del layout debug */
  layoutDebugPowerupGapMultiplier?: number;
}

/**
 * Configuración por defecto para NineSlice
 */
export const DEFAULT_NINESLICE_CONFIG: Required<Omit<NineSliceConfig, 'aspectRatio'>> & { aspectRatio: undefined } = {
  divisionX: 0.5,
  divisionY: 0.5,
  rangeX: 0.1,  // 10% del asset se estira
  rangeY: 0.1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  scaleMode: 'density',
  dprReference: 2,
  dprMinFactor: 0.8,
  dprMaxFactor: 1.25,
  repeat: 'round',
  aspectRatio: undefined,
};

/**
 * Configuración default para layout responsivo global
 */
export const DEFAULT_THEME_LAYOUT_CONFIG: Required<ThemeLayoutConfig> = {
  spacerHeaderBoardAspect: 28,
  spacerBoardRackAspect: 24,
  layoutDebugSpacerAspect: 75,
  layoutDebugNineSliceScaleMultiplier: 1,
  layoutDebugBoardPaddingMultiplier: 0.7,
  layoutDebugPowerupSizeMultiplier: 1,
  layoutDebugPowerupBubbleSizeMultiplier: 1,
  layoutDebugPowerupGapMultiplier: 1,
};

/**
 * Configuración de un tema completo
 */
export interface ThemeConfig {
  /** Nombre del tema */
  name: string;
  /** Tema del que hereda (normalmente "_base") */
  extends?: string;

  /** Configuración de NineSlice por panel/botón */
  panels?: Record<string, NineSliceConfig>;

  /** Configuración de NineSlice para assets custom */
  custom?: Record<string, NineSliceConfig>;

  /** Defaults globales para este tema */
  defaults?: NineSliceConfig;

  /** Layout responsivo global (no asociado a un asset específico) */
  layout?: ThemeLayoutConfig;
}

/**
 * Categorías de assets disponibles
 */
export type AssetCategory =
  | 'panels'
  | 'icons'
  | 'backgrounds'
  | 'pieces'
  | 'boosters'
  | 'powerups'
  | 'templates'
  | 'custom';

/**
 * Interfaz del hook useTheme
 */
export interface ThemeAssets {
  /** Nombre del tema actual */
  themeName: string;
  /** Indica si la configuración del tema y fallback base ya están cargados */
  isReady: boolean;

  // Assets con NineSlice (paneles, botones)
  panel: (name: string) => string;
  config: (name: string) => Required<NineSliceConfig>;
  layout: () => Required<ThemeLayoutConfig>;

  // Assets normales (sin estirar)
  icon: (name: string) => string;
  background: (name: string) => string;
  piece: (name: string) => string;
  booster: (name: string) => string;
  powerup: (name: string) => string;
  template: (name: string) => string;

  // Custom (específicos del juego)
  custom: (name: string) => string;
  customConfig: (name: string) => Required<NineSliceConfig>;
}
