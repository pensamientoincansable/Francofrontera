# FRONTERA // Dead Tide — Edición Completa

Shooter de francotirador 3D ambientado en una frontera costera asediada por zombis. Defiende la valla, protege a los civiles y sobrevive a oleadas cada vez más duras.

## Ejecutar

El juego es estático y usa Three.js desde CDN. Desde la raíz del proyecto:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Abre `http://localhost:4173`.

> **Nota:** el rifle Mauser 3D (`resources/gltf-Sniper/`) se carga por HTTP, así que hay que servir el proyecto (no funciona con `file://`).

## Controles

| Tecla | Acción |
|---|---|
| Ratón | Mover puntería (torreta fija) |
| Click izq. | Disparar |
| Click der. / Espacio | Mantener: zoom de precisión |
| 1 / 2 / 3 / 4 | Rifle · Pistola · Lanzagranadas · Misiles guiados |
| Rueda | Cambiar de arma |
| Q | Munición: normal → incendiaria → eléctrica |
| R | Recargar |
| F | Reparar valla (120 pts) |
| B | Tienda de mejoras |
| T | Ataque aéreo (desde oleada 3) |
| Enter | Desplegar siguiente oleada |
| P / Esc | Pausa |
| M | Silenciar |

## Contenido

**Progresión**
- 5 tipos de zombis: infectados, corredores, blindados, volátiles explosivos y trepadores.
- Jefe de oleada cada 5 oleadas, con barra de vida e invocación de refuerzos.
- Tienda de mejoras: daño, recarga, zoom (3×/4.5×/6.5×), cargadores y blindaje de valla.

**Arsenal**
- Rifle de cerrojo Mauser 98K (modelo GLTF del repositorio), pistola secundaria, lanzagranadas en arco y salva de 4 misiles guiados.
- Munición especial incendiaria (daño en el tiempo) y eléctrica (arco en cadena + ralentiza).

**Visual**
- Ciclo de día y noche, tormentas con lluvia, oleaje dinámico y rayos.
- Explosiones por capas con onda de choque, sangre, humo y valla que se derrumba por segmentos.
- Helicóptero 3D en patrulla con rotor audible, luces de navegación y foco nocturno; ejecuta el ataque aéreo.

**Jugabilidad**
- Objetivos secundarios por oleada, civiles que evacuar, soldados aliados, reparación de valla, rachas de bajas y ×2 por tiro a la cabeza.

**Audio (100% procedural, sin assets)**
- Disparos, recargas, explosiones, sirenas, gruñidos, radio militar con voz sintetizada y música dinámica según la amenaza.

**Modo completo**
- Menú principal, pausa, puntuación, récord local, ajustes (sensibilidad, volúmenes, calidad, voz) y guardado/continuación de progreso.

## Estructura

```
index.html          Interfaz y HUD
js/game.js          Núcleo: combate, oleadas, clima, UI y bucle
js/world.js         Escenario, clima, valla, helicóptero y armas en vista
js/entities.js      Zombis, jefes, civiles y soldados
js/fx.js            Partículas y explosiones
js/audio.js         Audio procedural (Web Audio API)
resources/          Modelo Mauser 98K (GLTF + texturas)
```
