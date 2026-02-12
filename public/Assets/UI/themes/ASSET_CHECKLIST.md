# Checklist de Assets UI

Este documento lista todos los assets necesarios para un tema completo.
Cada asset debe ser una imagen PNG pequeña (48x48 o 64x64 recomendado para paneles NineSlice).

---

## Flujo de Trabajo para Añadir Assets

1. **Coloca tus assets en:** `/public/Assets/MainUI/Pre-sort/`
2. **Nombra los archivos** como quieras (pueden tener nombres descriptivos temporales)
3. **Indica a Claude** qué es cada archivo
4. **Claude los renombrará** y moverá automáticamente a la carpeta correcta en `_base` o el tema activo

**Ejemplo:**
```
Pre-sort/
├── mi_panel_azul.png      → "Este es panel_main"
├── fondo_bonito.png       → "Este es bg_game"
└── boton_verde.png        → "Este es button_primary"
```

---

## Estructura de Carpetas

```
/themes/{nombre_tema}/
├── theme.config.json
├── panels/
├── icons/
├── backgrounds/
├── pieces/
├── boosters/
├── powerups/
├── templates/
└── custom/
```

---

## PANELS (NineSlice - estirables)

Los paneles usan el sistema NineSlice: imagen pequeña que se estira manteniendo bordes.
**Tamaño recomendado: 48x48 o 64x64 px**

### Contenedores Principales
| Archivo | Descripción | Usado en |
|---------|-------------|----------|
| `panel_main.png` | Panel principal del juego | Contiene el tablero |
| `panel_popup.png` | Ventanas popup | Level Complete, Game Over, Ads |
| `panel_score.png` | Cajas de puntuación | Dentro de popups |
| `panel_header.png` | Cabecera superior | Nivel, movimientos, objetivos |
| `panel_tooltip.png` | Tooltips pequeños | Mensajes informativos |

### Contenedores de Juego
| Archivo | Descripción | Usado en |
|---------|-------------|----------|
| `container_board.png` | Marco del tablero | Alrededor del grid de juego |
| `container_next_main.png` | Rack de piezas | Contenedor inferior |
| `container_next_piece.png` | Slot de pieza | Cada hueco en el rack |
| `slot_empty.png` | Celda vacía | Fondo de celdas del tablero |

### Botones
| Archivo | Descripción | Usado en |
|---------|-------------|----------|
| `button_primary.png` | Botón principal (verde) | Next Level, Watch Ad, Continue |
| `button_secondary.png` | Botón secundario (azul) | Play Again |
| `button_cancel.png` | Botón cancelar (gris) | Cancel, Close |
| `button_icon.png` | Botón circular | Powerups (target, shuffle, etc.) |

### Barras y UI
| Archivo | Descripción | Usado en |
|---------|-------------|----------|
| `progress_bar_bg.png` | Fondo de barra | Objetivos |
| `progress_bar_fill.png` | Relleno de barra | Progreso de objetivos |
| `objective_box.png` | Caja de objetivo | Cada objetivo individual |

---

## ICONS (imágenes normales, no estirables)

**Tamaño recomendado: 64x64 o 128x128 px**

| Archivo | Descripción |
|---------|-------------|
| `icon_music.png` | Toggle música ON |
| `icon_music_off.png` | Toggle música OFF |
| `icon_sound.png` | Toggle sonido ON |
| `icon_sound_off.png` | Toggle sonido OFF |
| `icon_settings.png` | Configuración |
| `icon_pause.png` | Pausa |
| `icon_play.png` | Play/Continuar |
| `icon_home.png` | Volver al menú |
| `icon_retry.png` | Reintentar |
| `icon_star.png` | Estrella/Logro |
| `icon_coin.png` | Moneda |
| `icon_heart.png` | Vida |
| `icon_target.png` | Powerup diana |
| `icon_wildcard.png` | Powerup varita |
| `icon_shuffle.png` | Powerup shuffle |
| `icon_refresh.png` | Powerup refresh/trash |

---

## BACKGROUNDS

**Tamaño: Resolución completa o tileable**

| Archivo | Descripción |
|---------|-------------|
| `bg_game.png` | Fondo principal del juego |
| `bg_menu.png` | Fondo del menú (si aplica) |
| `bg_overlay.png` | Overlay oscuro para popups (opcional, puede ser CSS) |

---

## PIECES (piezas del puzzle)

**Tamaño recomendado: 64x64 o 128x128 px**

| Archivo | Descripción |
|---------|-------------|
| `piece_red.png` | Pieza roja |
| `piece_blue.png` | Pieza azul |
| `piece_green.png` | Pieza verde |
| `piece_yellow.png` | Pieza amarilla |
| `piece_purple.png` | Pieza morada |
| `piece_orange.png` | Pieza naranja |

---

## BOOSTERS (potenciadores especiales)

**Tamaño recomendado: 64x64 o 128x128 px**

| Archivo | Descripción |
|---------|-------------|
| `booster_bomb.png` | Bomba (3x3) |
| `booster_rocket_h.png` | Cohete horizontal |
| `booster_rocket_v.png` | Cohete vertical |
| `booster_line_bomb.png` | Bomba de línea (cruz) |
| `booster_superball.png` | Superball (elimina color) |

---

## POWERUPS (habilidades del jugador)

**Tamaño recomendado: 64x64 px**

| Archivo | Descripción |
|---------|-------------|
| `powerup_target.png` | Eliminar bloque específico |
| `powerup_wildcard.png` | Cambiar color de bloque |
| `powerup_shuffle.png` | Reorganizar tablero |
| `powerup_trash.png` | Descartar piezas |

---

## TEMPLATES (pantallas de sistema)

Assets para pantallas globales (loading, splash, transiciones).

| Archivo | Descripción |
|---------|-------------|
| `loading_level.png` | Pantalla de loading entre niveles (fullscreen) |
| `splash_loading.png` | Fallback de loading/splash (fullscreen) |

---

## CUSTOM (específicos del juego)

Carpeta para assets únicos de cada tema/juego que no encajan en las categorías estándar.
Definir en `theme.config.json` bajo la sección `"custom"`.

---

## Notas para Diseñadores

1. **NineSlice**: Los paneles deben tener bordes/esquinas decorativas y un centro que pueda estirarse sin perder calidad.

2. **Consistencia**: Mantener el mismo estilo visual en todos los assets de un tema.

3. **Nombres**: Usar exactamente los nombres de archivo listados para que el sistema los encuentre.

4. **Fallback**: Si un asset no existe en el tema actual, el sistema usará el de `_base`.

5. **Config**: Ajustar `divisionX`, `divisionY`, `rangeX`, `rangeY` y `scale` en `theme.config.json` para cada panel según sea necesario.
