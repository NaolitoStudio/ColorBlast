# Arquitectura de ColorBlast

Este documento describe la estructura y los principios de diseño del proyecto ColorBlast.

## 1. Estructura de Pantallas y Navegación
El punto de entrada (`App.tsx`) actúa como un **Orquestador de Pantallas**.

- **App.tsx**: Gestiona el estado de la pantalla actual (`menu` | `game`) y las estadísticas globales (vidas, monedas, estrellas).
- **MainMenu**: Interfaz de entrada con acceso a perfiles de usuario y botón de inicio.
- **Game**: Componente contenedor de toda la lógica de juego activa.

## 2. Sistema de Componentes y UI
Se utiliza un enfoque de **UI Basada en Assets**, donde la apariencia visual se define mediante recursos gráficos temáticos.

- **Paneles Adaptables (Nine-Slice)**: Para elementos que requieren escalado sin distorsión (botones, ventanas, contenedores), se usan `NineSlice.tsx` y `ResponsiveNineSlicePanel.tsx`.
- **Assets Directos**: Elementos con dimensiones fijas o comportamientos específicos (iconos de power-ups, piezas del juego, fondos y efectos visuales) se renderizan directamente o mediante `ThemedImage` para soportar el sistema de temas.
- **Renderizado de Piezas**: Las piezas del juego se componen dinámicamente usando los iconos definidos en el tema actual.

## 3. Sistema de Temas (`src/theme/`)
El proyecto está diseñado para ser totalmente "themeable".

- **ThemeContext**: Provee los assets (imágenes, audios) y configuraciones de Nine-Slice dinámicamente.
- **_base theme**: Contiene los assets por defecto. Otros temas (como `forest`) pueden extender o sobrescribir estos assets.

## 4. Layout Responsivo (`src/layout/`)
Dado que es un juego que debe funcionar en múltiples dispositivos:

- **useResponsiveMetrics**: Un hook centralizado que calcula dimensiones, gaps, tamaños de fuente y offsets basados en el viewport.
- **panelStack**: Lógica para apilar paneles verticalmente manteniendo sus proporciones individuales.

## 5. Lógica de Juego (`utils/`)
La lógica está desacoplada del renderizado para facilitar tests y mantenimiento.

- **gameLogic.ts**: Funciones puras para manipulación de grids, detección de matches, generación de piezas y validación de movimientos.
- **useAudio.ts**: Gestor centralizado de efectos de sonido y música.

## 6. Flujo de Datos
1. **Global**: Estadísticas de usuario y persistencia en `App.tsx` (o un futuro Store).
2. **Local**: El estado del tablero, piezas en mano y animaciones residen en `Game.tsx`.
3. **Configuración**: `constants.ts` define el tamaño del grid y las dificultades de los niveles.

## 7. Convenciones de Código
- **TypeScript Estricto**: Todos los modelos de datos deben estar definidos en `types.ts`.
- **Estilos**: Tailwind CSS para utilidades rápidas, pero dimensiones críticas calculadas por el sistema de Layout.
- **Assets**: Todos los assets deben pasar por el sistema de temas (`useTheme()`) en lugar de importaciones directas siempre que sea posible.
