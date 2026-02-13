import React, { forwardRef } from 'react';
import { NineSlice } from './NineSlice';
import { NineSliceConfig } from '../theme/types';

interface ResponsiveNineSlicePanelProps extends NineSliceConfig {
  src: string;
  widthPercent: number;
  baseBorderWidthPx?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  alignSelf?: React.CSSProperties['alignSelf'];
}

/**
 * Wrapper reutilizable para paneles NineSlice:
 * - Ancho proporcional (en % del contenedor)
 * - Respeta aspectRatio definido en config de tema
 * - Evita repetir estilos base en cada pantalla
 */
export const ResponsiveNineSlicePanel = forwardRef<HTMLDivElement, ResponsiveNineSlicePanelProps>(({
  src,
  widthPercent,
  className = '',
  style,
  children,
  onClick,
  alignSelf = 'center',
  ...nineSliceConfig
}, ref) => (
  <NineSlice
    ref={ref}
    src={src}
    {...nineSliceConfig}
    className={className}
    style={{
      width: `${widthPercent}%`,
      maxWidth: '100%',
      flexShrink: 0,
      alignSelf,
      ...style,
    }}
    onClick={onClick}
  >
    {children}
  </NineSlice>
));

ResponsiveNineSlicePanel.displayName = 'ResponsiveNineSlicePanel';

export default ResponsiveNineSlicePanel;
