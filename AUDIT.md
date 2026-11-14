# Auditoría Técnica — Crónicas de Eldonia

Auditoría por capas (Rendimiento de Renderizado, Memoria y GC, Lógica y Bugs, UI/DOM y Red) e integración unificada de `DayNightCycle` (`1 hora de juego = 600s reales`, `24h = 4h reales`, inicio a las `06:00`).

---

## Hallazgos Críticos (rompen el juego o causan crashes)
- [x] **Colisión parcial en agua/lava y tap-to-move inválido (`src/game/GameEngine.ts`)**: `tryMoveEntity()` únicamente evaluaba `isLiquidAt(tryX.x, tryX.z)` en el punto central ignorando el `radius` de la entidad, y `onPointerUp()` permitía fijar `moveTarget` y `tapMarkerMesh` dentro de celdas líquidas.
- [x] **Auto-ataque e intención de movimiento residuales al abrir modales o pausar (`src/game/GameEngine.ts`)**: `setHeroModalOpen(true)`, `setForgeOpen(true)`, `openDialogue()` y `togglePause()` no limpiaban `moveTarget`, `autoAttackTarget` ni `tapMarkerMesh`, dejando movimiento/auto-ataque residual pendiente tras cerrar diálogos o ventanas.

## Hallazgos Altos (afectan rendimiento seriamente)
- [x] **Explosión de geometrías, materiales y buffers de partículas por enemigo (`src/game/core/ProceduralEntity.ts`, `src/game/ProceduralActors.ts`, `src/game/GameEngine.ts`)**: ~280 enemigos creaban cada uno geometrías `ExtrudeGeometry` propias, `CircleGeometry` individual para sombra, `THREE.Points` inactivo (`particlePoolSize: 20`) y un `MeshBasicMaterial` individual para su anillo de telegrafía.
- [x] **Exceso de `PointLight` simultáneos en la escena (`src/game/props3d.ts`, `src/game/GameEngine.ts`)**: 11 `PointLight` fijos en antorchas + `crystalLight` + pool de proyectiles forzaban bucles extensos de luces puntuales en todos los shaders PBR/Lambert.
- [x] **Re-renderizado de React a 60 FPS por números flotantes (`src/game/GameEngine.ts`, `src/App.tsx`, `src/components/GameHUD.tsx`, `src/game/FloatTextSystem.ts`)**: `updateFloatItems()` asignaba objetos/arrays cada frame e invocaba `setFloats(out)` sobre el árbol React en cada cuadro con daño o botín activo.
- [x] **Reconstrucción pesada de snapshots en `emitHud` cada 100 ms (`src/game/GameEngine.ts`)**: Cada cambio en `cdSig` o barra de recursos reconstruía `buildForgeSnapshot()`, `buildInventorySnapshot()`, `buildInventorySlotsView()` y `buildBankSlotsView()`.
- [x] **Redibujado incondicional del minimapa 5 veces/segundo (`src/components/Compass.tsx`)**: `setInterval(drawMinimap, 200)` reevaluaba 1,225 celdas procedurales aunque el jugador estuviera inmóvil.

## Hallazgos Medios (mejoras notables)
- [x] **Textura PMREM residual y código muerto con `CanvasTexture` (`src/game/GameEngine.ts`, `src/game/textures.ts`, `src/game/props3d.ts`)**: `RoomEnvironment` creaba 1 textura PMREM en GPU (`renderer.info.memory.textures === 1`) y existía `src/game/textures.ts` sin referencias.
- [x] **Bounding spheres en chunks instanciados y arrays temporales en `ChunkManager` (`src/game/ChunkManager.ts`, `src/game/core/GrassChunk.ts`, `src/game/core/TreeChunk.ts`)**: `TREE_KINDS` y `ROCK_VARIANTS` se reasignaban por instancia y las `boundingSphere` estaban centradas en `Y = 0` sin compensar altura vertical.
- [x] **Asignación de `new THREE.Color()` por burst y loop continuo de `ActionBar` (`src/game/core/ProceduralEntity.ts`, `src/components/ActionBar.tsx`)**: `spawnAdditiveBurst()` creaba un `THREE.Color` por ráfaga y `ActionBar.tsx` renderizaba continuamente su `WebGLRenderer` secundario a 30 FPS incluso sin hover ni animación.

## Hallazgos Bajos (pulido)
- [x] **Falta de telemetría de rendimiento verificable (`src/game/GameEngine.ts`)**: Incorporado reporte vivo mediante `renderer.info` (`calls`, `triangles`, `geometries`, `textures`, `programs`) y `PerformanceObserver` (`longtask`) en `getPerformanceReport()` / `window.__eldoriaDebug.getPerf()`.
- [x] **Sin `backdrop-filter` en CSS/TSX**: Verificado 0 usos en `src/`.
- [x] **Uso consistente de `delta` (`dt`) y regla Flyff +16**: Verificado `dt` acotado (`Math.min(rawDt, 0.05)`) en todos los sistemas y regla +16 niveles verificada (`0 EXP` y `0x` drop cuando `enemy.level >= hero.level + 16`).
- [x] **Sin fugas de red ni listeners globales críticos**: Single-player puro sin `fetch`/`WebSocket` por frame; listeners limpiados en `dispose()`.

---

## Correcciones Aplicadas
- [x] **Colisiones en agua/lava y tap-to-move seguro (`src/game/GameEngine.ts`)**: Agregado `isPositionSafeFromLiquid(x, z, radius)` (centro + 8 puntos perimetrales) en `tryMoveEntity()` y recorte progresivo hacia la orilla segura en `onPointerUp()` para evitar marcar destinos dentro de agua o lava.
- [x] **Limpieza unificada de intención (`src/game/GameEngine.ts`)**: `clearMovementAndCombatIntent()` limpia `keys`, `joyVec`, `actionBuffer`, `hero.clearMoveTarget()`, `hero.clearAutoAttackTarget()` y `tapMarkerMesh` al abrir Forja, Banco, Héroe, Diálogo o al pausar; `damageEnemy()` limpia `autoAttackTarget` y `targetEnemy` al morir un enemigo.
- [x] **Deduplicación de geometrías, materiales y eliminación de pools ociosos (`src/game/core/ProceduralEntity.ts`, `src/game/ProceduralActors.ts`, `src/game/props3d.ts`, `src/game/GameEngine.ts`)**:
  - `EXTRUDED_GEO_CACHE` comparte geometrías de partes entre enemigos del mismo tipo (`enemy:${kind}:${idx}`).
  - `_sharedShadowGeo` comparte una sola `CircleGeometry(1, 18)` escalada por `shadowBaseRadius`.
  - `particlePoolSize: 0` en enemigos y NPCs (elimina ~300 `THREE.Points` ociosos; los bursts usan el pool único de `GameEngine`).
  - `teleMatNormal` y `teleMatBoss` compartidos vía `telegraphMesh.visible` en lugar de ~280 materiales.
  - `props3d.ts` fusiona partes por material (`mergeNormalizedParts`) y reutiliza `SHARED_PROP_GEOS` / `SHARED_PROP_MATS` con `MeshLambertMaterial` (protegidos frente a `dispose()` prematuro en `buildLandmarks()` / `dispose()`).
- [x] **Pool dinámico de luces de antorcha (`src/game/props3d.ts`, `src/game/GameEngine.ts`)**: Reemplazadas 11 `PointLight` fijas por un pool de 3 `PointLight` asignadas dinámicamente cada frame a las antorchas visibles más cercanas (< 22u) e intensificadas de noche.
- [x] **Cero texturas GPU (`src/game/GameEngine.ts`, `src/game/textures.ts`)**: Eliminado `src/game/textures.ts` (código muerto con `CanvasTexture`) y removido `RoomEnvironment` / PMREM para lograr `renderer.info.memory.textures === 0` real en todo el proyecto.
- [x] **Números flotantes en DOM directo (`src/game/FloatTextSystem.ts`, `src/game/GameEngine.ts`, `src/App.tsx`, `src/components/GameHUD.tsx`)**: Pool de nodos `div` con `translate3d`, cero allocaciones por frame y cero `setState` de React a 60 FPS.
- [x] **Caché de snapshots pesados y minimapa (`src/game/GameEngine.ts`, `src/components/Compass.tsx`, `src/components/ActionBar.tsx`)**:
  - `emitHud()` cachea `forgeItems`, `inventory`, `inventorySlots` y `bankSlots` bajo `lastHeavyHudSig` evitando reconstruirlos cada 100 ms por cooldowns o regeneración de MP.
  - `Compass.tsx` omite el redibujado de 1,225 celdas cuando `(qx, qz, zoomRadius, seed)` no cambian.
  - `ActionBar.tsx` suspende el loop WebGL secundario cuando la mochila está en reposo (solo renderiza en montaje, cambio de estado, clic o hover).
- [x] **Chunks instanciados y scratch colors (`src/game/ChunkManager.ts`, `src/game/core/GrassChunk.ts`, `src/game/core/TreeChunk.ts`, `src/game/core/ProceduralEntity.ts`)**: Constantes `TREE_KINDS`/`ROCK_VARIANTS` izadas a módulo, `boundingSphere` ajustadas en `Y` (`frustumCulled = true` activo en todos los `InstancedMesh`) y `_burstScratchColor` reutilizado en `spawnAdditiveBurst()`.
- [x] **Sistema Unificado `DayNightCycle` (`src/game/DayNightCycle.ts`, `src/game/core/GlobalDayNightUniforms.ts`, `src/game/Constants.ts`, `src/game/EventBus.ts`, `src/components/GameClock.tsx`)**:
  - Escala exacta `TIME.REAL_SECONDS_PER_GAME_HOUR = 600` (1 hora juego = 10 min reales; 24h = 4h reales; inicio `06:00`).
  - 6 fases con transiciones suaves (`smoothstep`): `0–5` Noche profunda (`#0a0a2a`), `5–7` Amanecer (`#ff8c42`→`#87CEEB`), `7–17` Día (`#87CEEB`), `17–19` Atardecer (`#87CEEB`→`#ff6b35`), `19–21` Crepúsculo (`#ff6b35`→`#2a1a4a`), `21–24` Noche (`#0a0a2a`).
  - Uniforms globales compartidos (`uTimeOfDay`, `uSunDirection`, `uAmbientColor`) conectados a `EntityShader`, `WaterShader`, `GrassChunk`, `TreeChunk` y `ChunkManager` (terreno + lava).
  - Niebla dinámica (más cercana de noche `28..78` vs día `42..115`), ventanas de casas cálidas, luciérnagas en bosque/pradera (`THREE.Points` + `AdditiveBlending`), partículas doradas en amanecer/atardecer, criaturas nocturnas más activas/agresivas, reloj discreto `HH:MM` sin fondo bajo la brújula (`time:minuteChanged`) y persistencia de `gameTimeHours` en `localStorage`.

---

## Verificación Realizada
- **Compilación y tipos**: `npm run build` (`vite build`) y `npm run lint` (`tsc --noEmit`) aprobados sin errores ni advertencias.
- **Análisis estático de auditoría**:
  - `backdrop-filter`: 0 ocurrencias en `src/`.
  - `CanvasTexture` / `RoomEnvironment`: 0 ocurrencias activas en `src/`.
  - `InstancedMesh` con `frustumCulled = false`: 0 ocurrencias (`GrassChunk` y `TreeChunk` usan `frustumCulled = true` con `boundingSphere` calculada).
- **Simulación verificada del ciclo temporal (`npx tsx`) y progresión Flyff**:
  - Inicio a `06:00` (`uTimeOfDay = 0.25`); tras `600s` simulados avanza exactamente a `07:00` emitiendo eventos `'time:minuteChanged'` y `'time:phaseChanged'`.
  - Muestreo de las 6 fases validado (`02:00` `#0a0a2a` fog `28..78`, `05:30` `#f5976c`, `12:00` `#94cee6` fog `42..115`, `18:00` `#caafb8`, `20:00` `#9d4f53`, `22:30` `#0a0a2a` fog `28..78`).
  - Regla Flyff +16 verificada: nivel 5 vs nivel 5 (`50 EXP`), nivel 5 vs nivel 20 (`350 EXP`), nivel 5 vs nivel 21 (`0 EXP`, `0x` drop).
- **Telemetría WebGL en vivo**: Disponible en runtime mediante `window.__eldoriaDebug.getPerf()` (reporta `renderer.info.render.calls`, `triangles`, `geometries`, `textures`, `programs`, `avgFrameMs` y `PerformanceObserver` `longTasks` / `maxLongTaskMs`). *(Nota: el entorno de ejecución actual es headless sin binario Chromium instalado, por lo que los contadores WebGL vivos en GPU deben comprobarse en navegador con `__eldoriaDebug.getPerf()`).*
