import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  ThemeConfig,
  ThemeAssets,
  NineSliceConfig,
  DEFAULT_NINESLICE_CONFIG,
  AssetCategory,
} from './types';

const BASE_THEME = '_base';
const THEMES_PATH = '/Assets/UI/themes';

interface ThemeProviderProps {
  /** Nombre del tema a usar */
  theme: string;
  children: React.ReactNode;
}

const ThemeContext = createContext<ThemeAssets | null>(null);

/**
 * Provider de temas - envuelve la app para dar acceso a assets temáticos
 *
 * Ejemplo:
 * ```tsx
 * <ThemeProvider theme="forest">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ theme, children }) => {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);
  const [baseConfig, setBaseConfig] = useState<ThemeConfig | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [assetCache, setAssetCache] = useState<Map<string, boolean>>(new Map());

  // Cargar configuración del tema y del tema base
  useEffect(() => {
    let cancelled = false;

    setIsReady(false);
    setThemeConfig(null);
    setBaseConfig(null);

    const loadConfigs = async () => {
      let loadedThemeConfig: ThemeConfig | null = null;
      let loadedBaseConfig: ThemeConfig | null = null;

      try {
        // Cargar config del tema actual
        const themeResponse = await fetch(`${THEMES_PATH}/${theme}/theme.config.json`);
        if (themeResponse.ok) {
          loadedThemeConfig = await themeResponse.json();
        }

        // Cargar config base (si el tema actual no es _base)
        if (theme !== BASE_THEME) {
          const baseResponse = await fetch(`${THEMES_PATH}/${BASE_THEME}/theme.config.json`);
          if (baseResponse.ok) {
            loadedBaseConfig = await baseResponse.json();
          }
        } else {
          loadedBaseConfig = loadedThemeConfig;
        }
      } catch (error) {
        console.warn(`[Theme] Error loading theme config:`, error);
      } finally {
        if (cancelled) return;
        setThemeConfig(loadedThemeConfig);
        setBaseConfig(loadedBaseConfig);
        setIsReady(true);
      }
    };

    loadConfigs();

    return () => {
      cancelled = true;
    };
  }, [theme]);

  /**
   * Verificar si un asset existe (con cache)
   */
  const checkAssetExists = useCallback(async (path: string): Promise<boolean> => {
    if (assetCache.has(path)) {
      return assetCache.get(path)!;
    }

    try {
      const response = await fetch(path, { method: 'HEAD' });
      const exists = response.ok;
      setAssetCache(prev => new Map(prev).set(path, exists));
      return exists;
    } catch {
      setAssetCache(prev => new Map(prev).set(path, false));
      return false;
    }
  }, [assetCache]);

  /**
   * Obtener URL de un asset con fallback a _base
   */
  const getAssetUrl = useCallback((category: AssetCategory, name: string): string => {
    // Primero intentar en el tema actual
    const themePath = `${THEMES_PATH}/${theme}/${category}/${name}.png`;
    const basePath = `${THEMES_PATH}/${BASE_THEME}/${category}/${name}.png`;

    // Por defecto retornar la ruta del tema, el fallback se maneja via onerror en <img>
    // o verificando existencia asíncronamente
    // Para simplificar, retornamos el tema actual y si falla, el componente puede manejar el error
    return themePath;
  }, [theme]);

  /**
   * Obtener URL de asset con fallback síncrono (para uso directo)
   * Usa la convención: si el tema extiende _base, fallback automático
   */
  const getAssetWithFallback = useCallback((category: AssetCategory, name: string): string => {
    // Si el tema es _base, usar directamente
    if (theme === BASE_THEME) {
      return `${THEMES_PATH}/${BASE_THEME}/${category}/${name}.png`;
    }

    // Si el tema extiende _base, usar _base como fallback
    // Intentamos primero el tema actual, pero si sabemos que extiende _base
    // y el asset probablemente no existe en el tema, usamos _base directamente
    const themePath = `${THEMES_PATH}/${theme}/${category}/${name}.png`;
    const basePath = `${THEMES_PATH}/${BASE_THEME}/${category}/${name}.png`;

    // Mientras la config del tema no está cargada, priorizamos _base para
    // evitar un primer intento a rutas que no existen (flash de carga tardía).
    if (!themeConfig) {
      return basePath;
    }

    // Si el tema extiende _base (indicado en config), usar _base por defecto
    // ya que es más probable que los assets estén ahí
    if (themeConfig?.extends === BASE_THEME) {
      return basePath;
    }

    return themePath;
  }, [theme, themeConfig]);

  /**
   * Obtener configuración de NineSlice para un panel
   * Merge: config específica > defaults del tema > defaults globales
   */
  const getConfig = useCallback((panelName: string): Required<NineSliceConfig> => {
    // Buscar en config del tema actual
    const themePanel = themeConfig?.panels?.[panelName];
    const themeDefaults = themeConfig?.defaults;

    // Buscar en config base
    const basePanel = baseConfig?.panels?.[panelName];
    const baseDefaults = baseConfig?.defaults;

    // Merge en orden de prioridad
    return {
      ...DEFAULT_NINESLICE_CONFIG,
      ...baseDefaults,
      ...basePanel,
      ...themeDefaults,
      ...themePanel,
    };
  }, [themeConfig, baseConfig]);

  /**
   * Obtener configuración de NineSlice para un asset custom
   */
  const getCustomConfig = useCallback((customName: string): Required<NineSliceConfig> => {
    const themeCustom = themeConfig?.custom?.[customName];
    const themeDefaults = themeConfig?.defaults;
    const baseDefaults = baseConfig?.defaults;

    return {
      ...DEFAULT_NINESLICE_CONFIG,
      ...baseDefaults,
      ...themeDefaults,
      ...themeCustom,
    };
  }, [themeConfig, baseConfig]);

  // API del tema
  const themeAssets: ThemeAssets = {
    themeName: theme,
    isReady,

    // Assets con NineSlice
    panel: (name: string) => getAssetWithFallback('panels', name),
    config: getConfig,

    // Assets normales
    icon: (name: string) => getAssetWithFallback('icons', name),
    background: (name: string) => getAssetWithFallback('backgrounds', name),
    piece: (name: string) => getAssetWithFallback('pieces', name),
    booster: (name: string) => getAssetWithFallback('boosters', name),
    powerup: (name: string) => getAssetWithFallback('powerups', name),
    template: (name: string) => getAssetWithFallback('templates', name),

    // Custom
    custom: (name: string) => getAssetWithFallback('custom', name),
    customConfig: getCustomConfig,
  };

  return (
    <ThemeContext.Provider value={themeAssets}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook para acceder a los assets del tema actual
 *
 * Ejemplo:
 * ```tsx
 * const theme = useTheme();
 * <NineSlice src={theme.panel('panel_main')} {...theme.config('panel_main')} />
 * <img src={theme.icon('star')} />
 * ```
 */
export const useTheme = (): ThemeAssets => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  return context;
};

/**
 * Componente de imagen con fallback automático a _base
 */
export const ThemedImage: React.FC<{
  src: string;
  fallbackSrc?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ src, fallbackSrc, alt = '', className, style }) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  // Generar fallback automático si no se proporciona
  const autoFallback = fallbackSrc || src.replace(/\/themes\/[^/]+\//, `/themes/${BASE_THEME}/`);

  const handleError = () => {
    if (!hasError && currentSrc !== autoFallback) {
      setCurrentSrc(autoFallback);
      setHasError(true);
    }
  };

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      onError={handleError}
    />
  );
};

export default ThemeProvider;
