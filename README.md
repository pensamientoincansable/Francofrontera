# FRONTERA // Dead Tide — Edición Completa

Shooter táctico de francotirador 3D ambientado en una torre de vigilancia fronteriza asediada por zombis. Defiende la valla a larga distancia, despliega ametralladoras autónomas, protege a los civiles y sobrevive a oleadas cada vez más intensas.

## Ejecutar

El juego es estático y usa Three.js desde CDN. Desde la raíz del proyecto:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Abre `http://localhost:8000`.

> **Nota:** el rifle Mauser 3D (`resources/gltf-Sniper/`) se carga por HTTP, así que hay que servir el proyecto (no funciona con `file://`).

## Controles Adaptativos

### PC (Teclado y Ratón)
| Tecla / Acción | Función |
|---|---|
| **Ratón** | Apuntar suavemente desde la torre elevada |
| **Click izq.** | Disparar arma actual |
| **Click der. / Espacio** | Activar mira telescópica (zoom con desenfoque periférico) |
| **E / C** | **Desplegar ametralladora autónoma (hasta 4 en el perímetro)** |
| **1 / 2 / 3 / 4** | Seleccionar arma (Rifle · Pistola · Lanzagranadas · Misiles) |
| **Rueda** | Cambiar de arma |
| **Q** | Alternar munición especial (Normal → Incendiaria → Eléctrica) |
| **R** | Recargar arma |
| **F** | Reparar valla fronteriza (120 pts) |
| **T** | Solicitar ataque aéreo de helicóptero (Oleada 3+) |
| **B** | Arsenal / Tienda de mejoras de campo |
| **Enter** | Desplegar siguiente oleada (durante intermisión) |
| **P / Esc** | Pausa |
| **M** | Silenciar audio |

### Android / Pantallas Táctiles
- **Superficie de arrastre (lado izquierdo/centro):** Control suave de orientación y puntería sin disparos accidentales.
- **Botón FUEGO:** Botón circular prominente para disparar con el pulgar derecho (soporta ráfaga mantenida).
- **Botón MIRA:** Alterna la mira telescópica con zoom óptico y desenfoque periférico.
- **Botón TORRETA:** Coloca ametralladoras autónomas en las posiciones clave del perímetro defensivo.
- **Botones de acción táctiles:** Recarga rápida, reparación de valla, ataque aéreo y cambio de munición.
- **Botón Pantalla Completa (⛶):** Oculta barras de navegación para máxima inmersión táctil.

## Novedades y Características Principales

### 1. Nido de Francotirador Elevado a Gran Distancia
- Posición reubicada en la plataforma superior de una torre de observación militar a 13.5 metros de altura y 35 metros de distancia de la valla.
- Ángulo de tiro descendente realista sobre el sector costero, permitiendo avistar a los zombis desde su emergencia en la playa hasta la línea defensiva.
- Registro de impacto y headshots optimizado para la perspectiva elevada.

### 2. Hasta 4 Ametralladoras Autónomas (Torretas Sentry)
- Capacidad para desplegar hasta 4 ametralladoras autónomas pesadas a lo largo del perímetro defensivo (Flanco Izquierdo, Centro-Izquierda, Centro-Derecha, Flanco Derecho).
- IA de adquisición de objetivos: rastreo de zombis a 48 metros, sensor láser (escaneo en verde, bloqueo en rojo), ráfagas automáticas de doble cañón con retroceso y trazadoras.
- Alerta por radio cuando la horda empieza a sobrepasar al francotirador solitario.

### 3. Visibilidad Clara de Enemigos en la Valla
- Batería de focos y reflectores perimetrales instalados en los postes de la valla que iluminan el área de aproximación con haces de luz de alta intensidad.
- Dos potentes focos tácticos en la torre de francotirador orientados hacia la valla.
- Ajuste de niebla e iluminación ambiental nocturna para evitar que las figuras se pierdan en la oscuridad.
- Marcadores tácticos de amenaza e indicadores visuales sobre la cabeza de los zombis conforme se aproximan a la línea.

### 4. Mira Telescópica con Desenfoque Periférico
- Zoom telescópico de alta precisión (4.5× base, ampliable a 6.5× y 9.0× mediante mejoras).
- Efecto óptico de desenfoque periférico mediante filtro de lente que difumina y oscurece el entorno exterior a la retícula, minimizando distracciones y consumo de recursos.
- Retícula táctica mil-dot con punto central rojo de precisión, telemetría de distancia en tiempo real (`RNG: XX M`) e identificación de blanco (`BLANCO: [TIPO]`).

### 5. Interfaz Minimalista Durante el Gameplay
- HUD rediseñado con líneas limpias y estilizadas: barra superior delgada, pastillas tácticas compactas y paneles transparentes.
- En modo mira telescópica, el HUD oculta automáticamente los elementos secundarios para ofrecer una visión 100% despejada del campo de batalla.

## Estructura del Proyecto

```
index.html          Interfaz minimalista, mira telescópica y controles táctiles adaptativos
js/game.js          Núcleo del juego: combate, oleadas, torretas, cámara elevada y bucle principal
js/world.js         Mundo 3D: torre de vigilancia, iluminación perimetral, valla y clima
js/entities.js      Entidades: ametralladoras autónomas, zombis con visibilidad reforzada, civiles y soldados
js/fx.js            Efectos visuales: trazadoras, destellos, impactos, humo y explosiones
js/audio.js         Audio procedural: disparos, torretas, zoom óptico, explosiones y música dinámica
resources/          Modelo 3D del fusil Mauser 98K (GLTF + texturas)
```
