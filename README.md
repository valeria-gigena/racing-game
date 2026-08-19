# Racing Game

Juego de carreras 3D para navegador de escritorio, corre 100% en el
cliente (sin backend). Construido con Three.js + Rapier + Vite.

> Proyecto en desarrollo por fases. El estado actual, qué falta y las
> decisiones de diseño tomadas están en [PROGRESS.md](./PROGRESS.md).

## Instalación

```bash
npm install
npm run dev
```

Abrí la URL que imprime la terminal (por defecto `http://localhost:5173`).

## Controles (estado actual — Fase 5)

| Acción | Teclado |
|---|---|
| Acelerar | `W` / `↑` |
| Frenar / marcha atrás | `S` / `↓` |
| Girar | `A`/`D` o `←`/`→` |
| Freno de mano (frenada seca) | `Espacio` |
| Derrape (desliza y carga turbo) | `Shift` |
| Debug: pista siguiente (de 15) | `N` |
| Debug: ciclar vueltas de la carrera (5/10/15) | `L` |
| Debug: ciclar dificultad | `K` |
| Debug: ciclar cantidad de bots de IA (0/3/6/9) | `B` |
| Debug: cámara libre (orbitar/zoom con el mouse) | `C` |

**Manejo tipo Mario Kart**: fuera del derrape, doblar no te hace perder
velocidad (a diferencia de un auto real, donde el agarre lateral de las
gomas "roba" impulso al girar) — el auto mantiene la velocidad mientras
gira, exactamente como en Mario Kart. El derrape (`Shift`) es la única
parte del manejo con física de neumáticos real, a propósito.

**Derrape y turbo**: mantené `Shift` mientras doblás a buena velocidad
para deslizar de forma controlada (a diferencia del freno de mano, no
frena en seco). Sostenerlo dentro del derrape carga una barra de hasta 3
niveles (se ve abajo al centro de la pantalla); soltar `Shift` dispara un
turbo cuya fuerza depende de cuánto cargaste — igual que el mini-turbo de
Mario Kart. Si te vas de cola del todo, perdés la carga sin premio.

**Debug — `P`**: activa/desactiva la física de transferencia de peso
(el cabeceo al frenar/acelerar y el vuelco al doblar). Con el toggle
apagado el auto se mantiene siempre nivelado; el resto del manejo
(aceleración, freno, dirección, agarre, derrape) no cambia. Pensada para
comparar cómo se siente el juego con y sin ese efecto.

**Superficies**: salirse del asfalto baja notoriamente la velocidad
máxima, la aceleración y la capacidad de giro, y hace que el derrape se
vuelva mucho más resbaladizo y difícil de controlar (asfalto > pasto ≈
grava > arena ≈ hielo). Si se sale a alta velocidad, el exceso se frena
gradual, no de golpe.

**Pistas (15)**: mezcla de circuitos con nombre real (Monza,
Silverstone, Mónaco, Nürburgring Nordschleife, Spa-Francorchamps,
Interlagos) y pistas ficticias con ambiente propio muy distinto entre sí
(playa, luna, selva, nieve, desierto, ciudad neón, volcán, arrecife,
espacio). Cada pista tiene su cantidad de vueltas recomendada (5/10/15)
y una dificultad sugerida; el menú para elegirlas es la Fase 8 — por
ahora se cambia con las teclas de debug de la tabla de arriba (`N`/`L`/
`K`).

**Bots de IA**: hasta 9 autos manejados por la máquina (`B` para cambiar
la cantidad, arranca en 3), cada uno siguiendo la pista por su cuenta
sin ruta pre-armada — miran unos metros adelante sobre la misma curva
que dibuja el asfalto para decidir hacia dónde doblar y qué tan rápido
ir. La dificultad (`K`) afecta qué tan tarde frenan en las curvas.
Manejan bien en pistas anchas/rápidas; en las más técnicas y angostas
(Mónaco) se salen de pista seguido, aunque no quedan trabados.

Soporte de mando (Gamepad API) se agrega en una fase posterior.

## Estructura del proyecto

```
racing-game/
├── index.html
├── src/
│   ├── main.js
│   ├── core/         # Engine (render loop), SceneManager, InputManager
│   ├── entities/      # Car, Track, AIDriver
│   ├── physics/        # PhysicsWorld + VehicleController (Rapier) + SurfaceTypes
│   ├── data/            # tracks.json (15 pistas), environments.js, difficulty.js (cars.json en la Fase 6)
│   ├── ui/                # menús y HUD
│   └── modes/               # modos de juego (carrera rápida, campeonato, etc.)
├── public/assets/       # modelos, texturas y sonidos (placeholders por ahora)
└── docs/ASSETS_SOURCES.md  # de dónde sacar assets reales y su licencia
```

- **Renderizado**: Three.js
- **Física**: `@dimforge/rapier3d-compat` (raycast vehicle controller)
- **Build**: Vite
- **Input**: teclado + Gamepad API
- **Persistencia**: `localStorage` (sin backend)
- **Audio**: Howler.js
