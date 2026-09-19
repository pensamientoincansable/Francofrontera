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
| **W A S D / Flechas** | **Mover al tirador A PIE**: recorre el sector de nuestro lado y las 4 plantas de la torre |
| **Shift** | Correr |
| **Ratón** | Apuntar (giro libre 360°). La vista se adapta al zoom con la *sensibilidad de mira* de AJUSTES |
| **Click izq.** | Disparar arma actual |
| **Click der. / Espacio** | Activar mira telescópica (a **pantalla completa**, solo se ve el bisel en los bordes) |
| **ESC / Botón QUITAR MIRA** | Salir de la mira telescópica |
| **V** | Editor de vallado (abre/cierra): la vista vuela a **≈6 m sobre el terreno construible** |
| **W A S D (en el editor)** | **Mover la posición de la visión (el cuerpo)** con total libertad sobre el terreno · **Shift** sube · **C** baja |
| **Arrastrar ratón (en el editor)** | Girar la vista (la cabeza) · **Rueda** = zoom de la vista |
| **H** | **Apartar / mostrar el menú del vallado** (deja la pantalla despejada para colocar) |
| **Espacio / Enter (en el editor)** | **COLOCAR** la valla exactamente en la retícula (colocación por tecla, máxima precisión) y apartar el menú automáticamente |
| **R / Click der. (en el editor)** | Rotar el tramo de valla |
| **1-4 (en el editor)** | Elegir modelo de valla · **E** construir · **X** demoler |
| **E / C** | Desplegar ametralladora autónoma (hasta 4 en el perímetro) |
| **L** | Fabricar lancha de defensa en nuestra playa (200 pts, oleada 2+, máx. 2) |
| **1 / 2 / 3 / 4** | Seleccionar arma (Rifle · Pistola · Lanzagranadas · Misiles) |
| **Rueda** | Cambiar de arma (en el editor de vallado: zoom de la vista) |
| **Q** | Alternar munición especial (Normal → Incendiaria → Eléctrica) |
| **R** | Recargar arma |
| **F** | Reparar las 3 vallas fronterizas (120 pts) |
| **T** | Solicitar ataque aéreo de helicóptero (Oleada 3+) |
| **B** | Arsenal / Tienda de mejoras de campo |
| **Enter** | Desplegar siguiente oleada (durante intermisión) |
| **P / Esc** | **Pausa real**: congela enemigos, proyectiles, clima, agua, helicóptero y audio |
| **M** | Silenciar audio |
| **ALT (mantener)** | Mostrar el cursor para usar los botones del HUD sin perder la partida |

> En PC el puntero se bloquea al entrar en combate. Si el bloqueo se pierde solo (p. ej. al pulsar ESC o al cambiar de ventana), **la partida se pausa automáticamente**: nunca sigues en combate sin control.

### Android / Pantallas Táctiles
- **Joystick virtual (mitad izquierda):** aparece **justo donde apoyas el pulgar** y **desaparece al soltar**. Desliza para caminar, subir y bajar escaleras; no ocupa pantalla cuando no lo usas.
- **Arrastre en el resto de la pantalla:** puntería 360° (la sensibilidad se ajusta en AJUSTES, con valor propio para la mira puesta).
- **Rejilla de armas 2×2:** cuatro botones grandes junto al botón de fuego. Sustituyen a las ranuras diminutas del HUD, que se colapsaban en cuanto ajustabas el zoom del navegador.
- **Botón FUEGO:** disparo con el pulgar derecho (soporta ráfaga mantenida).
- **Botón MIRA:** mira telescópica **a pantalla completa** (bisel fino en los bordes, retícula centrada, telemetría).
- **⏸ PAUSA:** pastilla propia en la columna de acciones táctiles (además del botón de la barra superior).
- **Botón COLOCAR (editor de vallado):** barra flotante en el borde derecho con COLOCAR · ROTAR · MODO · MENÚ · SALIR. COLOCAR pone la valla en la retícula **y aparta el menú** para ver exactamente dónde cae; MENÚ lo vuelve a traer. En móvil el panel se abre ya apartado y, cuando se muestra, queda como hoja inferior sin tapar la retícula.
- **Resto de botones tácticos:** torreta, lancha, reparación, apoyo aéreo, munición especial, recarga, pantalla completa (⛶).

## Novedades: Tirador a pie, torre de 4 plantas y interfaz adaptativa

- **Movimiento libre (WASD / joystick):** el tirador ya no está clavado en el nido. Puede bajar al sector, caminar entre las vallas y recorrer la torre. Es más arriesgado: a pie de suelo los infectados que rebasan la línea **van a por él cuerpo a cuerpo** (mitad de daño que el asalto a la torre) y las piedras que caen a menos de 3,6 m hieren. El HUD avisa con `⚠ ESTÁS A PIE DE SUELO` y muestra la planta actual (`BASE · P0` → `VIGÍA · P3`).
- **Torre ampliada: 2 plantas hacia arriba y 1 hacia abajo.** Cuatro niveles útiles —**BASE (P0)**, **NIDO (P1)**, **OBSERVATORIO (P2)** y **VIGÍA (P3)**— unidos por una **caja de escaleras real** en la cara sur (5 tramos en tijera con rellanos y puentes). Se sube y se baja **caminando**, sin saltos ni botones: el sistema de superficies (`sampleWalk` / `walkBlocked`) resuelve peldaños, rellanos, barandillas, parapetos, pilares y sacos. La posición inicial sigue siendo el nido del francotirador.
- **Pausa de verdad:** con la partida en pausa (o cualquier menú modal abierto) el bucle deja de avanzar: `dt = 0` para entidades, proyectiles, clima, agua, helicóptero, audio y sacudidas de cámara. Solo se redibuja el fotograma congelado. El menú principal sigue teniendo fondo vivo con un reloj propio que no toca el estado de la partida.
- **Vallado personalizado persistente:** los tramos que coloques (tipo, posición, rotación e integridad) **se guardan en la partida** y se restauran al pulsar CONTINUAR. Solo desaparecen al **empezar de cero** o al **demolerlos** desde el editor.
- **Perímetro de aparición corregido:** la línea de spawn se calcula desde la **valla más alejada** de nuestro lado (las 3 capas base o las que hayas colocado tú). Nada —tampoco los jefes— puede aparecer ya entre nuestras vallas: los jefes entran 20-34 m más allá del frente y el resto 11-26 m.
- **Mira a pantalla completa:** fuera el círculo negro pequeño. Ahora la vista ocupada por la mira es **toda la pantalla**, con un bisel fino, esquinas tácticas, viñeteado de lente, retícula centrada y telemetría. Apuntar con la mira puesta es **mucho más ágil**: el divisor de sensibilidad es una potencia fraccionaria del aumento (no el aumento completo) y hay un ajuste propio (`Sensibilidad con la mira puesta`, por defecto 1,2×).
- **Editor de vallado fuera del centro:** en PC el panel queda **atracado a la izquierda**; en móvil, como **hoja inferior** que se abre ya apartada. La **barra flotante COLOCAR** vive en el borde derecho y aparta el menú en cuanto colocas, así la retícula nunca queda tapada.
- **Cámara libre en el editor de vallado:** al pulsar **V** la vista vuela rápidamente a **≈6 m de altura sobre el terreno construible**. Desde ahí el **cuerpo** de la visión se mueve con total libertad (**WASD/flechas o joystick**; **Shift** sube y **C** baja), la **cabeza** gira arrastrando el ratón (o el dedo) y la **rueda** hace zoom. La colocación es **por tecla** (**ESPACIO/ENTER** en la retícula), para dejar cada valla exactamente donde quieres.
- **Clima y mareas configurables:** en AJUSTES puedes **desactivar los efectos climáticos** (tormenta, lluvia y rayos) y regular la **velocidad de las mareas** de 0× (mar en calma) a 3× (marejada rápida).
- **Sin circulitos amarillos:** retiradas las bombillas esféricas amarillas que flotaban sobre las vallas. Quedan el báculo oscuro y la luz que baña el terreno (la iluminación del perímetro no cambia).

## Novedades: Costa 25/75, Frente Paralelo y Lancha de Defensa

- **Mar delimitado a la costa:** el plano de agua termina exactamente en la línea de orilla (`x = -26`) y **no se solapa con el terreno**; arena, arena húmeda y espuma marcan la frontera entre mar y tierra.
- **Campo de visión 25/75:** la torre mira al horizonte **paralela al mar** (costa norte-sur, mar a la izquierda): el mar ocupa el **25 % izquierdo** de la visión y la tierra firme el **75 % derecho**. Se enfrenta a los invasores **de frente**: llegan desde el horizonte por la playa hasta las vallas.
- **Vallas solo en tierra firme:** las 3 capas (Exterior −14 m, Media −7 m, Interior −1 m) se extienden únicamente sobre tierra, con 16 m de margen a la orilla; cada capa conserva su integridad, HUD y postes propios.
- **Lancha de defensa del jugador (L):** se **fabrica** (200 pts, oleada 2+, máx. 2) y queda **anclada en nuestro lado de la frontera** (playa, a 0,6 m de la línea de agua, proa al mar). No cruza la orilla: vigila el flanco marítimo y abre fuego automático sobre los objetivos de mar (nadar, botar lancha, navegar) que se acerquen a la frontera. Puede ser destruida por explosiones cercanas (propias o enemigas); si es así, la playa queda desprotegida hasta fabricar otra.

## Novedades: Mar al Oeste, Triple Valla y Asalto Anfibio

- **Mar a la izquierda (oeste):** la costa corre de norte a sur; el flanco marítimo queda abierto.
- **3 capas de vallas** en profundidad (Exterior −14 m, Media −7 m, Interior −1 m), cada una con su integridad, HUD propio y postes que caen por separado.
- **Tres roles de asalto:** unos **rompen** las vallas capa por capa, otros las **trepan** (1,4 s por capa) y otros **cruzan por el mar**: tardan **3 s en poner la lancha** y **2 s en salir** de la orilla, navegan hacia el sur y desembarcan tras la valla interior.
- **La mayoría porta armas cuerpo a cuerpo** (bate, machete, tubería, hacha: +1 de daño) **y lanza piedras** contra las vallas (2 de daño) y la torre (3 de daño).
- Lanchas varadas en la orilla, chapoteos, avisos por radio del desembarco y torreta «Flanco Mar» cubriendo la costa.

## Novedades y Características Principales

### 1. Torre de Vigilancia de 4 Plantas con Nido de Francotirador Elevado
- Cuatro plantas transitables: **BASE (P0, a nivel de suelo)**, **NIDO (P1, ~14 m)**, **OBSERVATORIO (P2, ~18 m)** y **VIGÍA (P3, ~22 m)**, unidas por una caja de escaleras de 5 tramos en la cara sur.
- Ojo del tirador a ~14 m de altura (posición inicial), de pie tras el parapeto bajo del nido, a ~33 m de la valla.
- Encuadre inclinado hacia abajo: la valla y todo el campo de tiro quedan siempre en cuadro; el parapeto solo asoma en la franja inferior y se ve una parte del muro únicamente al mirar muy hacia abajo (para disparar apoyado en los sacos).
- Ángulo de tiro descendente realista sobre el sector costero, permitiendo avistar a los zombis desde su emergencia en la playa hasta la línea defensiva.
- Los infectados que superan la valla se amontonan al pie de la torre, dentro del campo de visión, y se avisa por radio para mirar hacia abajo.
- Registro de impacto y headshots optimizado para la perspectiva elevada.

### 2. Hasta 4 Ametralladoras Autónomas (Torretas Sentry)
- Capacidad para desplegar hasta 4 ametralladoras autónomas pesadas a lo largo del perímetro defensivo (Flanco Izquierdo, Centro-Izquierda, Centro-Derecha, Flanco Derecho).
- IA de adquisición de objetivos: rastreo de zombis a 48 metros, sensor láser (escaneo en verde, bloqueo en rojo), ráfagas automáticas de doble cañón con retroceso y trazadoras.
- Alerta por radio cuando la horda empieza a sobrepasar al francotirador solitario.

### 3. Visibilidad Clara de Enemigos en la Valla
- Batería de focos y reflectores perimetrales instalados en los postes de la valla que iluminan el área de aproximación con haces de luz de alta intensidad (sin bombillas esféricas visibles: solo báculo oscuro y luz).
- Dos potentes focos tácticos en la torre de francotirador orientados hacia la valla.
- Ajuste de niebla e iluminación ambiental nocturna para evitar que las figuras se pierdan en la oscuridad.
- Marcadores tácticos de amenaza e indicadores visuales sobre la cabeza de los zombis conforme se aproximan a la línea.

### 4. Mira Telescópica con Desenfoque Periférico
- Zoom telescópico de alta precisión (4.5× base, ampliable a 6.5× y 9.0× mediante mejoras).
- Efecto óptico de desenfoque periférico mediante filtro de lente que difumina y oscurece el entorno exterior a la retícula, minimizando distracciones y consumo de recursos.
- Retícula táctica mil-dot con punto central rojo de precisión, telemetría de distancia en tiempo real (`RNG: XX M`) e identificación de blanco (`BLANCO: [TIPO]`).
- Botón **✕ QUITAR MIRA** siempre visible dentro de la propia mira para salir sin soltar el ratón o el dedo (también con ESC o soltando click der.).

### 5. Interfaz Minimalista Durante el Gameplay
- HUD rediseñado con líneas limpias y estilizadas: barra superior delgada, pastillas tácticas compactas y paneles transparentes.
- En modo mira telescópica, el HUD oculta automáticamente los elementos secundarios para ofrecer una visión 100% despejada del campo de batalla.

## Estructura del Proyecto

```
index.html          Interfaz minimalista, mira telescópica y controles táctiles adaptativos
js/game.js          Núcleo del juego: combate, oleadas, torretas, cámara elevada y bucle principal
js/world.js         Mundo 3D: torre de vigilancia, iluminación perimetral, valla y clima
js/entities.js      Entidades: ametralladoras, zombis (rompedores/trepadores/asaltantes de mar), lancha de defensa del jugador, piedras, civiles y soldados
js/fx.js            Efectos visuales: trazadoras, destellos, impactos, humo y explosiones
js/audio.js         Audio procedural: disparos, torretas, zoom óptico, explosiones y música dinámica
resources/          Modelo 3D del fusil Mauser 98K (GLTF + texturas)
```
