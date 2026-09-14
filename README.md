# FRONTERA // Dead Tide

Shooter de francotirador 3D ambientado en una frontera costera asediada por zombis.

## Ejecutar

El juego es estático y usa Three.js desde CDN. Desde la raíz del proyecto:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Abre `http://localhost:4173`.

## Controles

- **Click izquierdo**: disparar
- **Click derecho / barra espaciadora**: zoom 3x
- **E**: lanzar cohete
- **R**: disparar
- El ataque aéreo se desbloquea en la oleada 3

## Incluye

- Escenario 3D de costa, arena, mar, niebla, luces y valla defensiva.
- Oleadas progresivas de zombis con movimiento y salto.
- Mira, zoom, munición, recarga, confirmación de impactos y daño recibido.
- Animación de proyectil giratorio con estela y líneas de velocidad.
- Lanzacohetes con recarga y apoyo aéreo desbloqueable.
