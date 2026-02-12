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
