# Progreso del proyecto — Racing Game

> Si arrancás una sesión nueva, leé este archivo primero para retomar
> donde quedamos.

## Fase actual: 5 — IA de hasta 9 bots por waypoints (cerrada)

## Hecho

- **Fase 0 — Planificación**: arquitectura acordada, estructura de
  carpetas, formato de `cars.json`/`tracks.json`/`difficulty.json`,
  fórmula de economía, decisiones de stack (ver "Decisiones tomadas"
  abajo).
- **Fase 1 — Proyecto base**:
  - Proyecto Vite + Three.js inicializado (`package.json`,
    `vite.config.js`, `index.html`).
  - `src/core/Engine.js`: render loop (`setAnimationLoop`), cámara
    perspectiva, resize handling.
  - `src/core/InputManager.js`: teclado (WASD + flechas + espacio para
    freno de mano), expone un `state` unificado pensado para que el
    Gamepad de la Fase 10 use el mismo shape.
  - `src/core/SceneManager.js`: luces, arma la pista y el auto, cámara
    en tercera persona que sigue al auto con suavizado (lerp
    exponencial).
  - `src/entities/Car.js`: placeholder geométrico (caja + cabina +
    franja frontal) con movimiento **cinemático** (sin física real
    todavía): aceleración, frenado, marcha atrás, giro proporcional a
    la velocidad, fricción natural.
  - `src/entities/Track.js`: pista ovalada tipo "stadium" (dos rectas +
    dos semicírculos concéntricos), suelo de pasto, línea de largada,
    postes de referencia visual alrededor del trazado.
  - `docs/ASSETS_SOURCES.md`: bancos de assets curados y convención de
    nombres de archivo para cuando se reemplacen los placeholders
    (Fase 11).
- **Fase 2 — Física del vehículo**:
  - `src/physics/PhysicsWorld.js`: inicializa el WASM de Rapier
    (`RAPIER.init()`, asíncrono), crea el `World` con gravedad, y expone
    un acumulador de paso fijo (`FIXED_TIMESTEP = 1/60`) — Rapier
    necesita un dt constante, no el dt variable del `requestAnimationFrame`.
  - `src/physics/VehicleController.js`: chasis (rigid body dinámico +
    collider) y 4 ruedas vía `DynamicRayCastVehicleController` de
    Rapier (raycast vehicle). Traduce el input a fuerza de motor
    (traseras), freno, freno de mano (solo traseras, corta el motor
    mientras está activo) y dirección (delanteras, con transición suave
    en vez de golpe de volante).
  - `Car.js` y `SceneManager.js` reescritos: el movimiento ya no es
    cinemático, el mesh se sincroniza cada frame con el rigid body real.
  - `Track.js` suma un collider estático plano para todo el terreno
    (pasto + asfalto con la misma fricción por ahora — diferenciarla es
    la Fase 3).
  - `Engine.js` pasa a tener `init()` asíncrono (por el WASM de Rapier)
    separado del constructor.
  - **Bugs encontrados y corregidos durante el desarrollo** (quedan
    documentados en comentarios en el código, no solo acá):
    - El setter de `indexForwardAxis` del controller tiene un nombre
      distinto al getter en esta versión de la librería
      (`setIndexForwardAxis`, no `indexForwardAxis` — typo de Rapier).
    - `setWheelBrake` **no** usa la misma escala que
      `setWheelEngineForce` pese a que el tipo de ambos dice "fuerza":
      un valor de freno de un par de cientos ya frena mucho más fuerte
      que el motor a fondo. Usar valores grandes por analogía con el
      motor desestabilizaba la suspensión y lanzaba el auto por el
      aire al frenar. Los valores actuales (`MAX_BRAKE_FORCE = 45`)
      salieron de probar en el navegador, no de la documentación.
    - Un collider cuboide con masa uniforme le da al auto muchísima
      menos resistencia rotacional (inercia) de la que tiene un auto
      real (que concentra la masa abajo, cerca de las ruedas) —
      alcanzaba con frenar fuerte para volcarlo. Se corrigió fijando un
      tensor de inercia manual (`setAdditionalMassProperties`) que
      escala cabeceo/vuelco/giro por separado, simulando un centro de
      masa más bajo sin cambiar la forma visual.
    - Mantener acelerador y freno de mano juntos anulaba el freno (el
      motor "ganaba"): el freno de mano ahora corta el motor trasero
      mientras está activo.
  - Verificado por simulación directa en el navegador (sin depender de
    ver la animación en tiempo real, ver nota en "Cómo probar" abajo):
    aceleración/frenado/reversa estables, viraje normal sin freno de
    mano se mantiene agarrado (casi sin deslizamiento), freno de
    mano + viraje a alta velocidad produce derrape marcado y perceptible
    (ángulo de deslizamiento de decenas de grados) sin que el auto
    despegue del piso ni vuelque.
- **Refinamiento post-Fase 2 — Derrape con tecla dedicada + turbo** (a
  pedido del usuario, después de probar el freno de mano: "se siente un
  poco muy brusco" + quería algo tipo Mario Kart):
  - Nueva acción `drift` en `InputManager` (`Shift` izq/der), separada
    del freno de mano. El freno de mano (`Espacio`) sigue siendo una
    frenada seca normal; `Shift` es la herramienta de derrape pensada
    para usarse, con física más suave.
  - `VehicleController`: mientras se sostiene `Shift` doblando a más de
    ~29 km/h, se corta el motor trasero (el auto avanza por inercia) y
    se aplica un freno trasero suave (`DRIFT_BRAKE_FORCE`, bastante
    menor al del freno de mano) + agarre lateral trasero reducido. El
    resultado es un deslizamiento que crece gradualmente hasta ~30° en
    vez del salto brusco a 50-90° que daba el freno de mano solo.
  - Sistema de carga/turbo (3 niveles, como el mini-turbo de Mario
    Kart): mientras el ángulo de deslizamiento se mantiene en una
    "zona buena" (5°-40°, ni casi derecho ni descontrolado) se acumula
    tiempo de carga; irse de cola del todo (>60°) resetea la carga sin
    premio. Soltar `Shift` dispara un turbo (fuerza total de motor,
    reemplaza a la aceleración normal — no se le suma) proporcional al
    nivel alcanzado, por 0.35/0.55/0.85s.
  - `src/ui/DriftMeter.js` + elementos en `index.html`: barra de 3
    segmentos y flash de "¡TURBO!" — feedback visual mínimo y funcional,
    **placeholder hasta la Fase 8** (HUD real con sprites/efectos en vez
    de divs).
  - **Bugs encontrados en el camino** (además de los ya documentados
    arriba sobre freno vs. motor en la misma rueda):
    - Ni reducir solo el agarre lateral, ni forzar la velocidad angular
      (yaw) directamente con `setAngvel`, generan deslizamiento
      perceptible en este modelo de neumáticos — el solver realinea la
      velocidad lineal con el heading en menos de 0.15s en ambos casos.
      Lo único que funciona es interferir con la rodada de la rueda
      (freno), igual que con el freno de mano.
    - El derrape sin motor frena el auto solo; si se exigía la misma
      velocidad mínima para *sostener* el derrape que para *iniciarlo*,
      un derrape prolongado se cancelaba solo a mitad de camino (y
      perdía toda la carga) apenas la desaceleración natural cruzaba el
      umbral. El mínimo alto ahora solo aplica para arrancar un derrape
      nuevo.
  - Verificado igual que el resto de la Fase 2 (simulación directa,
    sin depender del panel visual): con freno de derrape suave, el
    ángulo de deslizamiento sube gradual hasta ~30°, la carga llega a
    nivel 1 en <1s sostenido, y soltar dispara un salto de velocidad
    claramente perceptible (en una prueba, de 13 a 30 km/h en ~0.3s).
- **Segundo ajuste — turbo desestabilizaba el auto + volante tosco**
  (feedback del usuario después de probar lo de arriba):
  - El turbo sumaba su fuerza a la del motor a fondo (picos de hasta
    2.6× lo normal) concentrada solo en el eje trasero → la trompa se
    levantaba y se perdía el control. Ahora el turbo **reemplaza** a la
    aceleración normal (no se suma), se reparte 60/40 entre traseras y
    delanteras, y sube/baja con una rampa en vez de aplicarse de un
    salto. También se subió un poco más el margen de inercia de
    cabeceo (`principalAngularInertia.x`, de ×3 a ×4.5). Probado el
    caso más exigente (turbo de nivel 3 disparado a fondo): cabeceo
    máximo bajó de "auto casi vertical" a ~3.5-5°, altura estable.
  - `STEER_RESPONSE_SPEED` subido de 4.5 a 9 (respuesta más directa al
    tocar A/D) para que sea menos tosco acomodar la entrada a una
    curva antes de derrapar. Un toque de 150ms ahora llega a ~24° de
    los 31.5° máximos (antes, mucho menos), y vuelve a centro rápido
    al soltar.
- **Tercer ajuste — el volante seguía tosco + el derrape giraba en su
  propio eje** (feedback del usuario después de probar lo de arriba):
  - El problema de fondo del volante no era la velocidad de respuesta:
    era que CUALQUIER toque, por corto que fuera, apuntaba hacia el
    ángulo máximo (31.5°) — imposible pedir un giro chico. Se
    reemplazó el acercamiento exponencial por una **rampa lineal**:
    `STEER_RATE` (rad/seg) mientras se mantiene A/D, así el ángulo
    crece proporcional al tiempo que se sostiene la tecla (un toque
    corto da un giro chico de verdad) y una tasa de retorno separada
    (`STEER_RETURN_RATE`, más rápida) para centrar solo al soltar.
  - El derrape daba radios de giro de ~6m (velocidad angular de hasta
    144°/seg — prácticamente un trompo). Ni limitar el ángulo de las
    delanteras durante el derrape (`DRIFT_STEER_SCALE`) ni bajar el
    freno trasero cambiaron el resultado de forma medible: una vez que
    el tren trasero pierde agarre, la velocidad angular parece quedar
    gobernada más por el momento angular ya acumulado que por el
    input de dirección en curso. La solución que sí funcionó es un
    límite directo: mientras se derrapa, la velocidad angular (yaw)
    del chasis no puede superar `DRIFT_MAX_YAW_RATE` (1.1 rad/seg). Es
    un límite de "sensación de juego", no de física realista, pero da
    control real del ancho del arco (radio pasó de ~6m a un rango de
    ~14-70m según la velocidad).
  - **Bug introducido y corregido en el camino**: tocar *solo* el eje
    de yaw con `setAngvel` y dejar cabeceo/vuelco (X/Z) intactos hacía
    que se acumulara velocidad angular en esos ejes durante el
    derrape sin que se notara en el momento — y el auto terminaba
    volcándose varios segundos **después** de soltar la tecla (llegó a
    55° de vuelco en una prueba). Se corrigió amortiguando también X/Z
    mientras dura el derrape, no solo limitando Y.
- **Debug — tecla `P`: apaga/prende la transferencia de peso** (pedido
  explícito del usuario, "deja todo igual pero..."):
  - `InputManager` suma la acción `toggleWeightTransfer` (`P`).
  - `VehicleController` detecta el flanco de subida de esa tecla (no es
    un held-state como el resto: un toque la prende, otro toque la
    apaga) y guarda un booleano `_weightTransferEnabled`.
  - Nuevo método `postPhysicsStep()`, llamado desde `SceneManager.update`
    después de `physicsWorld.step()`: con la transferencia de peso
    desactivada, frena a cero la velocidad angular de cabeceo/vuelco
    (ejes X/Z) cada frame — sin tocar aceleración, freno, dirección,
    agarre ni derrape. Verificado: cabeceo bajo freno pasó de ~5.7° a
    ~0.4°, y todo lo demás (velocidad, giro, derrape) se comportó
    igual que con la transferencia de peso activada.
  - **Bug encontrado y corregido en el camino**: la primera versión
    también re-fijaba la *rotación* del chasis a una quaternion pura de
    yaw cada frame (para que quedara perfectamente nivelado). Eso rompe
    el raycast de las ruedas del vehicle controller — que no espera que
    algo externo le mueva la orientación del chasis por fuera del
    solver — y el auto terminaba atravesando el piso (Y llegó a -82) y
    perdía la capacidad de girar. La solución final solo toca velocidad
    angular, nunca la rotación directamente.
  - `debug-hud` muestra un sufijo "Transferencia de peso: OFF" cuando
    está desactivada (placeholder de texto, no HUD real).
- **Cuarto ajuste — manejo normal reescrito 100% cinemático, "a lo Mario
  Kart"** (pedido explícito del usuario: "cópiale a Mario Kart toda la
  parte de manejo que no sea derrapar"; también notó que la versión
  anterior frenaba de más al doblar):
  - Se probaron dos intentos manteniendo el manejo normal sobre fricción
    de neumáticos antes de tirar esa idea:
    1. Solo ajustar la velocidad de giro → el auto perdía velocidad al
       doblar (el agarre lateral de las gomas le "roba" impulso, como
       en un auto real). Mario Kart no hace eso.
    2. Forzar la velocidad angular (yaw) del chasis directamente pero
       dejar que la velocidad *lineal* se reacomodara sola por
       fricción → no daba a tiempo: medido hasta 81° de deslizamiento
       doblando "normal" (debería ser 0), literalmente patinando de
       costado en vez de ir para donde mira.
  - **Solución final**: manejo normal 100% cinemático (igual que la
    Fase 1, antes de meter Rapier), corriendo *encima* del rigid body
    de Rapier (que sigue resolviendo gravedad/suspensión/contacto con
    el piso). Cada frame, fuera del derrape:
    - `_applyKinematicHandling` (en `applyInput`) actualiza una
      velocidad con signo `_kinematicSpeed` con aceleración/frenado/
      reversa/freno de motor tipo curva simple (`MK_ACCEL`,
      `MK_BRAKE_DECEL`, `MK_REVERSE_ACCEL`, `MK_COAST_DECEL`,
      `MK_HANDBRAKE_DECEL`, tope `MK_MAX_SPEED`/`MK_MAX_REVERSE_SPEED`)
      y fuerza la velocidad angular (yaw) del chasis directamente,
      proporcional a cuánto se dobla (`MK_TURN_RATE_MAX`).
    - `_applyKinematicVelocity` (en `postPhysicsStep`, después de que
      Rapier ya avanzó ese frame) fija la velocidad horizontal
      exactamente hacia donde mira el chasis, con la magnitud de
      `_kinematicSpeed` (+ bonus de turbo) — nunca hay diferencia entre
      hacia dónde mira el auto y hacia dónde se mueve.
    - Las ruedas quedan sin fuerza de motor/freno/dirección fuera del
      derrape (solo siguen sirviendo para que la suspensión de Rapier
      detecte el piso).
  - El **derrape sigue siendo 100% física real de neumáticos, sin
    tocar** (`_applyDriftPhysics`, separado en su propio método) — es
    la única parte del manejo que se dejó fuera a propósito.
  - El turbo pasó de "fuerza de motor extra" a un bonus de velocidad
    cinemático (`speedBonus` en m/seg en vez de `totalForce`), sumado
    directamente a `_kinematicSpeed` con la misma rampa de antes.
  - Al salir de un derrape, `_kinematicSpeed` se sincroniza con la
    velocidad real que traía el auto en ese instante (si no, saltaba/
    frenaba de golpe al volver al manejo normal).
  - `MAX_ENGINE_FORCE`/`REVERSE_ENGINE_FORCE` quedaron sin uso (el
    manejo normal ya no pasa por fuerza de motor) y se eliminaron.
  - Verificado: acelerando a fondo y doblando durante 3s sostenidos, la
    velocidad se mantuvo **exactamente** en el tope (108 km/h) todo el
    tiempo, con 0.0° de deslizamiento — cero pérdida de velocidad por
    doblar, que era el pedido explícito.
  - **Efecto secundario notado, no resuelto**: el derrape (que no se
    tocó) da un deslizamiento más débil cuando se entra a velocidades
    altas (~90+ km/h) que las que se usaron para afinarlo originalmente
    (~75-85 km/h) — la misma fuerza de freno de derrape tarda más en
    romper agarre a mayor velocidad. Se bajó `MK_MAX_SPEED` a 26 m/s
    (~94 km/h, antes 30 m/s) para acercar el tope de velocidad al rango
    donde el derrape sí se probó a fondo, pero no queda perfecto en el
    límite superior. Si se nota mucho jugando, es la próxima cosa para
    afinar.
- **Fase 3 — Fricción por superficie**:
  - `src/physics/SurfaceTypes.js`: tabla de multiplicadores por
    superficie (`maxSpeedMultiplier`, `accelMultiplier`,
    `gripMultiplier`, `turnRateMultiplier`) para `asphalt`, `grass`,
    `gravel` y `sand`. Esta pista solo usa asfalto/pasto; grava/arena
    quedan definidos para las pistas mixtas de la Fase 4 sin tener que
    volver a tocar este archivo.
  - `Track.getSurfaceTypeAt(x, z)`: en vez de un segundo collider físico
    con detección de contacto, calcula la superficie **geométricamente**
    reusando la misma matemática del "stadium" con la que ya se dibuja
    el asfalto (distancia del punto al segmento entre los dos centros de
    curva) — más simple y suficiente para esta pista placeholder. Pistas
    reales (Fase 4) probablemente necesiten guardar la superficie como
    dato del trazado en vez de calcularla así.
  - `SceneManager.update` calcula la superficie bajo el auto (con la
    posición ya sincronizada del frame anterior) y se la pasa a
    `car.applyInput(dt, input, surfaceKey)` → `VehicleController`.
  - En el manejo cinemático normal (Mario Kart), la superficie escala
    `MK_MAX_SPEED`, `MK_ACCEL`/`MK_REVERSE_ACCEL` y `MK_TURN_RATE_MAX`.
    El frenado (normal y de mano) queda igual en todas las superficies
    a propósito. Si el auto trae más velocidad de la que la superficie
    nueva permite (por ejemplo, salir de asfalto a pasto a fondo), el
    exceso se suelta gradual (`SURFACE_OVERSPEED_DECEL`) en vez de
    frenar en seco de golpe.
  - Durante el derrape, la superficie escala el agarre real de
    neumáticos (`frictionSlip` y `sideFrictionStiffness`, delanteras y
    traseras) — en pasto cuesta mucho más recuperar un derrape.
  - Verificado en el navegador: acelerando a fondo en asfalto se llega a
    93.6 km/h (el tope exacto); saliéndose derecho de la pista la
    velocidad decae gradualmente (no de golpe) hasta estabilizarse en
    65.5 km/h sobre pasto (70% del tope, como está configurado); un
    derrape a velocidad y freno iguales llega a ~20° de deslizamiento en
    pasto contra ~5-8° en asfalto; altura del auto estable en toda la
    transición (sin rebotes ni inestabilidad).

- **Fase 4 — Sistema de pistas (15+)**: reemplaza la pista fija en
  "stadium" de las Fases 1-3 por un sistema genérico de trazados +
  ambientes, y define 15 pistas jugables.
  - `Track.js` reescrito para ser genérico: recibe `trackData` (ancho +
    lista de puntos de control) y `environment`, arma un lazo cerrado
    suave con `THREE.CatmullRomCurve3` y extruye una cinta de asfalto de
    ancho constante a lo largo de la curva (el óvalo "stadium" de antes
    es ahora un caso particular de esto, no un código separado). Expone
    `getTrackInfo(x, z)` → `{ t, distance, onTrack, surfaceKey }`, donde
    `t` (0..1, posición a lo largo de la curva) sirve tanto para
    superficie como para contar vueltas.
  - `src/data/tracks/generateLoop.js`: generador de siluetas con ruido
    de radio reproducible (`mulberry32`, seedeable) — no reemplaza el
    diseño real de un circuito, pero da 15 formas distintas ajustando
    `numPoints`/`radiusX`/`radiusZ`/`variation`/`seed` sin dibujar cada
    punto a mano.
  - `src/data/environments.js`: 13 ambientes (colores de cielo/niebla/
    piso/asfalto + superficie de "afuera de pista"). Pedido explícito
    del usuario: "que varíe el ambiente, ej. una carrera en el espacio y
    otra en la playa" — hay ambientes mundanos (`classic_day/dusk/
    overcast`, `urban_dusk`, `forest_day`) para las pistas con nombre
    real, y ambientes muy distintos entre sí (`space`, `beach`, `moon`,
    `jungle`, `snow`, `desert`, `neon_city`, `volcano`, `reef`) para las
    ficticias. Son colores planos, no texturas — texturas/props reales
    son Fase 11.
  - `src/physics/SurfaceTypes.js` suma `ice` (agarre muy bajo, pero no
    frena tanto en línea recta como la arena) para las pistas de nieve.
  - `src/data/tracks.json`: 15 pistas. Mezcla nombres reales y
    ficticios (mismo criterio ya aceptado para `cars.json` — ver
    "Decisiones tomadas"): 6 con nombre e `inspiredBy` de circuitos
    reales conocidos (Monza, Silverstone, Mónaco, Nürburgring
    Nordschleife, Spa-Francorchamps, Interlagos) sobre ambientes
    mundanos, y 9 completamente ficticias (Órbita Cero, Costa Turquesa,
    Cráter Lunar, Selva Esmeralda, Cumbre Nevada, Dunas Ardientes, Neón
    Metrópolis, Caldera Ígnea, Arrecife Azul) sobre los ambientes
    exóticos. Algunas suman `surfaceZones` (tramos del propio asfalto
    con otra superficie, ej. grava en el Nürburgring, hielo en Cumbre
    Nevada) para que el soporte de pistas mixtas de `Track.js` tenga uso
    real, no solo teórico.
  - `src/data/difficulty.js`: 3 niveles (`easy`/`medium`/`hard`) con
    `aiSpeedMultiplier`/`coinMultiplier` ya definidos pero **sin usar
    todavía** — el brief dice que la dificultad afecta a la IA (Fase 5)
    y las monedas (Fase 6), que todavía no existen. Queda documentado a
    propósito para no tener que retocar esto cuando lleguen esas fases.
  - `SceneManager` pasa a dueño de la lista de pistas: `_loadTrack(i)`
    saca la pista anterior (`track.dispose()` + sacar el mesh de la
    escena) y arma la nueva a partir de `tracks.json` (genera los puntos
    con `generateLoopPoints`, arma `Track` + pinta `scene.background`/
    `scene.fog` según el ambiente). El auto no se recrea al cambiar de
    pista: `VehicleController.teleportTo()` (nuevo) reubica el rigid
    body existente en la nueva largada y resetea toda velocidad/estado
    de manejo (derrape, turbo, dirección) para no arrastrar nada de la
    pista anterior.
  - Conteo de vueltas (`SceneManager._updateLapCounter`): se apoya en el
    mismo `t` de `getTrackInfo` — cruzar de `t` cerca de 1 a `t` cerca de
    0 entre un frame y el siguiente cuenta una vuelta. Vueltas objetivo
    configurable (5/10/15, `LAP_OPTIONS` en `difficulty.js`) y
    dificultad seleccionable son requisito explícito de la Fase 4
    ("distintas modalidades por pista").
  - **Todavía no hay menú (eso es la Fase 8)**, así que por ahora se
    cambia con teclas de debug: `N` pasa a la pista siguiente, `L` cicla
    la cantidad de vueltas, `K` cicla la dificultad. Una segunda línea de
    HUD (`#race-hud`, placeholder de texto) muestra pista actual (+
    referencia real si la tiene), vuelta actual/objetivo y dificultad.
  - Verificado en el navegador (ver "Cómo probar" abajo por qué por
    consola y no por captura visual): las 15 pistas cargan sin
    excepciones, cada una con su color de cielo distinto y el auto
    spawneando sobre asfalto en coordenadas finitas; cambiar de pista 3
    veces seguidas no deja colliders de piso viejos acumulados (se
    mantiene en 2: piso + chasis); las zonas de superficie mixta
    (`surfaceZones`) devuelven la superficie correcta dentro de la zona y
    asfalto normal fuera de ella; el conteo de vueltas sube exactamente
    una vez al cruzar la largada y no antes; las teclas `N`/`L`/`K`
    reales (simulando `KeyboardEvent`, no llamando a los métodos
    directo) cambian pista/vueltas/dificultad y el HUD las refleja;
    acelerar 2 segundos después de todo lo anterior sigue dando el mismo
    comportamiento que en la Fase 3 (sin regresión en el manejo).

- **Bug crítico post-Fase 4 — asfalto autointersecado en las 15 pistas**
  (reportado por el usuario: "la calle esta sumamente buggeada, como si
  en algunas partes esta estuviese por debajo de la tierra"):
  - Causa: `generateLoopPoints` (`src/data/tracks/generateLoop.js`)
    generaba el ruido de radio de cada punto de control de forma
    independiente entre puntos vecinos. Con suficiente `variation` y
    `numPoints` (las 15 pistas, no solo algunas), eso da tramos donde el
    radio de curvatura real de la curva Catmull-Rom es más chico que la
    mitad del ancho de la pista (`width/2`) — medido en el peor caso
    original hasta ~1.2m de radio contra pistas de 10-16m de ancho.
    Cuando eso pasa, el borde interno de la cinta de asfalto
    (`Track._buildAsphalt`, offset lateral por `right` en cada frame) se
    pliega sobre sí mismo: la malla queda autointersecada y en el render
    se ve como si el asfalto desapareciera y se asomara el terreno de
    abajo, en vez de un simple giro cerrado.
  - Fix: `generateLoopPoints` ahora suaviza el array de ruido con 5
    pasadas de promedio circular de 3 puntos (`smoothNoise`,
    `NOISE_SMOOTH_PASSES = 5`) antes de aplicarlo al radio — reduce el
    zigzag de alta frecuencia entre puntos vecinos sin aplanar del todo
    la "personalidad" de cada trazado (ovalado vs. técnico).
  - Verificado con dos métodos, ninguno dependiente del panel visual del
    navegador (que en este entorno no está componiendo frames — ver nota
    en "Cómo probar" abajo):
    1. Script standalone (Node) que importa `generateLoopPoints` y
       `THREE.CatmullRomCurve3` reales, reconstruye la misma malla que
       `Track._buildAsphalt`, y cuenta intersecciones entre segmentos del
       borde interno para las 15 pistas de `tracks.json`. 0
       autointersecciones en las 15 (antes del fix: entre 2 y 12 por
       pista). El caso más ajustado post-fix es Mónaco (la pista más
       angosta y con más variación): radio de curvatura mínimo ~1.3× el
       medio-ancho de pista.
    2. Contra el servidor de dev real corriendo (no un mock): se agregó
       temporalmente `window.__engine = this` en `Engine.js`, se llamó
       `sceneManager._loadTrack(i)` para las 15 pistas una por una desde
       la consola, y se corrió el mismo chequeo de autointersecciones
       sobre la `BufferGeometry` real de cada `asphalt` mesh generada.
       0 autointersecciones en las 15. El hook de debug se sacó después
       de verificar (no queda en el código).
  - **Segunda causa del mismo bug, encontrada después de que el usuario
    reportó que el problema seguía igual tras un hard refresh** (el fix
    de arriba era real pero no era el único problema): `Track._buildFrames`
    usaba `curve.getSpacedPoints(SAMPLE_COUNT)` directo. Para una curva
    **cerrada**, eso devuelve `SAMPLE_COUNT + 1` puntos donde el primero y
    el último son el mismo punto (distancia 0) — sin sacar ese duplicado,
    queda un segmento de largo cero exactamente en el cierre del lazo
    (la línea de largada, justo donde arranca el auto), y como sus dos
    frames comparten posición pero no necesariamente el mismo vector
    `right`, ese quad queda degenerado/plegado ahí mismo — visible como
    un pliegue de asfalto pegado al auto en el spawn, en las 15 pistas
    (todas comparten esta misma estructura). Fix: `.slice(0, -1)` sobre
    el resultado de `getSpacedPoints` para quedarse con los
    `SAMPLE_COUNT` puntos únicos. Verificado igual que el bug anterior
    (script standalone + contra el servidor real con `_loadTrack(i)` en
    las 15 pistas): `quadFolds = 0` y separación normal (no cero) en el
    punto de cierre en las 15, antes y después comparado explícitamente.
  - **Tercera causa, la que resultó ser la real** (el usuario insistió en
    que seguía roto después de las dos anteriores, y finalmente aclaró:
    "la calle no aparece en ningún lugar de la pista" -- no era un punto
    específico, era la pista entera): las dos causas de arriba eran bugs
    reales (y quedan arregladas), pero no eran la causa de lo que
    reportaba el usuario. La causa real es de renderizado, no de datos
    -- por eso ningún chequeo de geometría (autointersección, sentido de
    rotación de triángulos, bounding boxes) la detectó: son chequeos de
    CPU sobre los vértices, y esto pasa en la GPU al decidir qué
    superficie queda arriba.
    - El asfalto está a `y=0.01` sobre el pasto (`y=0`) -- pensado para
      evitar z-fighting, pero insuficiente: con la cámara de este juego
      (`near=0.1`, `far=500`, un rango muy amplio) la precisión del
      depth buffer se degrada con la distancia, y pasado cierto rango
      (~100-150 unidades de la cámara, calculado con la fórmula
      estándar de precisión de depth buffer no lineal) ya no alcanza
      para distinguir 0.01 unidades de diferencia en Y -- el pasto le
      gana el z-test al asfalto y el asfalto no se dibuja. Esto explica
      por qué los reportes anteriores del usuario parecían distintos
      entre sí (línea negra, "la calle corta en un punto"): el
      z-fighting no es un patrón fijo, depende del ángulo/distancia
      exactos de cada frame.
    - Fix aplicado en esa sesión (resultó **insuficiente**, ver "Cuarta
      causa" abajo): `polygonOffset` en los materiales del asfalto
      (`polygonOffsetFactor/Units = -4`) y de la línea de largada (`-8`).
      El diagnóstico de z-fighting no estaba del todo mal (el offset en Y
      original de 0.01 era genuinamente muy poco), pero no era la causa
      principal de que "no aparezca la calle en ningún lado" -- ver abajo.
    - **Nota de esa sesión (ya no aplica, dejada por historial)**: no se
      pudo verificar visualmente este fix porque el navegador integrado
      no componía frames de WebGL. Esto se resolvió en la sesión
      siguiente -- ver el bloque de "Cuarta causa" y la nota actualizada
      en "Cómo probar" al final del archivo.
  - **Cuarta causa, encontrada en la sesión siguiente -- la real** (el
    usuario insistió de nuevo, "quiero que uses tu máxima capacidad para
    arreglar la calle que sigue siendo inexistente"; el fix de
    `polygonOffset`/offset en Y de la sesión anterior no alcanzaba, y
    encima el diagnóstico de z-fighting resultó estar equivocado):
    - Esta vez sí se pudo verificar contra frames reales del canvas (ver
      la técnica nueva más abajo), muestreando el color de pixel
      proyectando puntos conocidos del centro de la pista a coordenadas
      de pantalla con `worldPos.clone().project(camera)`. Resultado:
      el centro de la pista renderizaba del color del **pasto**, no del
      asfalto, en prácticamente toda la pista (29 de 34 puntos
      muestreados) -- ni siquiera con el `polygonOffset` de la sesión
      anterior aplicado. Eso descartó z-fighting de una: si fuera
      z-fighting, subir el offset en Y de 0.01 a 0.08 y reforzar
      `polygonOffsetFactor/Units` a -8 tendría que haber arreglado algo
      -- y no cambió nada (mismos resultados exactos antes y después).
    - Causa real: **backface culling**. `Track._buildAsphalt` arma los
      índices de cada quad como `(a, b, c, b, d, c)` con
      `a=left(i), b=edge(i), c=left(i+1), d=edge(i+1)`. El producto cruz
      `(v1-v0)×(v2-v0)` de ese orden da `cross(right, tangent) =
      (0, -1, 0)` -- la normal calculada queda mirando hacia ABAJO en
      cada quad de la cinta entera, en las 15 pistas (el orden de
      índices es el mismo siempre, no depende del trazado). Con el
      culling de caras traseras activado por defecto (`THREE.FrontSide`,
      el default de `MeshStandardMaterial`), ninguna triangulo del
      asfalto se dibuja nunca visto desde arriba -- ni desde la cámara
      normal ni desde la cámara libre en cenital. Esto explica por qué
      la cámara libre tampoco mostraba calle ("así se ve con la cámara
      libre no hay calle"): no era el ángulo ni el zoom, la malla
      literalmente nunca se dibuja vista desde arriba.
    - Fix real: invertir el orden de cada triángulo a `(a, c, b, b, c,
      d)` -- con ese orden el producto cruz da `(0, +1, 0)`, normal hacia
      arriba, visible con culling normal. Verificado con la técnica de
      proyección de pixeles: en Monza, 31/34 puntos muestreados a lo
      largo de la cinta clasifican como asfalto (antes del fix: 29/34
      pasto). En Silverstone (segunda pista probada, para confirmar que
      no es un caso particular): 39/45 puntos asfalto, 0 pasto. Se dejó
      además el offset en Y más generoso (0.08) y el `polygonOffset`
      más fuerte (-8, línea de largada -12) como cinturón de seguridad
      -- no eran la causa, pero no está de más tener margen real en Y
      además del offset de profundidad.
    - También se subió el `near` de la cámara de 0.1 a 1 (`Engine.js`) --
      tampoco era la causa de este bug puntual, pero 0.1 es
      innecesariamente chico para una cámara que nunca está a menos de
      un metro del auto, y reduce el rango near:far de 1:5000 a 1:500,
      dándole más precisión de profundidad al resto de la escena en
      general (sombras, otros objetos casi coplanares que puedan
      aparecer en fases futuras).
    - **Técnica nueva para verificar visualmente en este entorno** (el
      panel de navegador integrado sigue sin poder tomar screenshots
      interactivos -- "the page is not compositing frames" -- pero esto
      sí funciona, y es mejor que confiar en capturas): el problema real
      no era que el WebGL no renderizara, era que `document.hidden` es
      `true` en este panel y por lo tanto `requestAnimationFrame` **no
      dispara nunca** mientras el panel no esté "mostrado" (confirmado
      con un contador de rAF que se quedó en 0 después de varios
      segundos) -- así que `renderer.setAnimationLoop` nunca corre un
      solo frame, y el canvas queda en 0x0 con contenido nunca
      inicializado. La solución, en tres pasos:
      1. `window.dispatchEvent(new Event('resize'))` desde
         `javascript_tool` -- fuerza a `Engine._onResize` a correr y le
         da al canvas un tamaño real (sin esto queda en 0x0 aunque
         `window.innerWidth/innerHeight` ya midan bien).
      2. Exponer `window.__engine = this` temporalmente al final del
         constructor de `Engine.js` (se saca después de verificar, no
         queda en el código) y llamar `engine._tick()` manualmente varias
         veces desde la consola -- esto renderiza frames reales sin
         depender de `requestAnimationFrame`/rAF, que nunca dispara solo.
      3. Con el renderer ya en `preserveDrawingBuffer: true` (de la
         sesión anterior), leer el canvas real con
         `canvas.getContext('2d').drawImage(webglCanvas, ...)` +
         `getImageData` para muestrear colores de pixeles puntuales, en
         vez de pedir `toDataURL()` completo (que el visor de imágenes
         de esta sesión rechazó igual, aparentemente por algún límite/
         filtro -- no se pudo determinar la causa exacta, pero el
         muestreo de pixeles puntuales no lo necesita y es más preciso
         para verificar que una imagen para el ojo humano de todos
         modos).
      Con esto se puede confirmar con certeza (no por inferencia
      indirecta) qué color tiene un pixel específico de un frame real,
      proyectando puntos conocidos del mundo a coordenadas de pantalla
      con la matriz de cámara real (`Vector3.project(camera)`). Mucho
      más confiable que las capturas de pantalla para este tipo de bug.
  - **Cámara libre de debug (tecla `C`)**: el usuario pidió una forma de
    inspeccionar la pista con sus propios ojos ante la duda de si el
    fix de arriba funcionaba. `Engine.js` suma `OrbitControls` (de
    `three/examples/jsm/controls/OrbitControls.js`) sobre la misma
    cámara del juego, deshabilitado por default. `C` la prende/apaga
    (flanco de subida, mismo patrón que el resto de las teclas de
    debug); al prenderla la cámara salta a vista aérea del centro del
    mundo (`(0, 140, 0.01)` mirando a `(0,0,0)` -- todas las pistas
    quedan centradas ahí por cómo genera los puntos `generateLoopPoints`)
    y desde ahí se maneja con mouse (arrastrar = orbitar, rueda = zoom,
    click derecho = pan). Con la cámara libre activa, `SceneManager.
    updateCamera` no se llama (el auto se sigue manejando con WASD en el
    fondo, solo se desacopla la cámara). HUD de debug muestra "CÁMARA
    LIBRE" como sufijo mientras está activa.
  - **Nota de infraestructura, no de esta app**: en esta sesión se
    descubrió que había otro servidor de dev (de otra sesión/chat) ya
    corriendo en el puerto 5173 de esta misma carpeta -- el entorno de
    este agente no puede controlarlo ni leer sus logs. Los archivos son
    los mismos en disco así que no afecta la lógica del juego, pero para
    poder seguir verificando desde esta sesión se le sacó el puerto fijo
    a Vite (`vite.config.js` ahora usa `process.env.PORT` con fallback a
    5173) y se agregó `"autoPort": true` a `.claude/launch.json`. Si en
    una sesión futura el servidor no arranca en 5173, es exactamente por
    esto -- revisar qué otro proceso lo está usando antes de asumir que
    es un bug.

- **Fase 5 — IA de hasta 9 bots por waypoints**: `src/entities/AIDriver.js`
  (nuevo) maneja un auto solo, reusando la misma curva que ya calcula
  `Track` para el asfalto/conteo de vueltas -- no tiene ruta propia ni
  waypoints a mano. Cada frame calcula un input con la misma forma que
  `InputManager` (para que `VehicleController` no distinga teclado de
  IA):
  - **Dirección**: apunta a un punto un poco adelante sobre la curva
    (`Track.getPointAhead`, nuevo), corregido por el error lateral actual
    ("pure pursuit" con corrección de error transversal -- ver el porqué
    en el comentario grande de `AIDriver.js`, `LATERAL_CORRECTION_GAIN`).
  - **Velocidad**: en vez de un umbral de curvatura fijo, calcula la
    velocidad segura para el radio de giro más cerrado dentro de un
    horizonte de varias distancias (4 a 40m, `PROBE_DISTANCES`) usando el
    mismo modelo físico que ya gobierna al jugador (radio = velocidad /
    `MK_TURN_RATE_MAX`, exportado de `VehicleController.js` para esto) y
    acelera mientras la velocidad actual esté por debajo. `difficulty.js`
    ya tenía `aiSpeedMultiplier` reservado para esto -- ahora lo usa de
    verdad, escalando qué tan tarde/tanto suelta el acelerador en curva.
  - `Track.getGridStartTransform(slot)` (nuevo) ubica hasta 9 bots en una
    grilla escalonada detrás de la línea de largada, sin superponerse
    entre sí ni con el jugador.
  - `SceneManager` crea/destruye los bots (`_respawnBots`) al cambiar de
    pista o de dificultad, y los actualiza junto con el jugador cada
    frame (`update`: inputs de IA, luego un solo `physicsWorld.step` para
    todos los autos). Debug (sin menú todavía -- Fase 8): tecla `B` cicla
    la cantidad de bots (0/3/6/9, arranca en 3).
  - **Cuatro bugs reales encontrados simulando esto** (no se pudo
    verificar a simple vista por el mismo problema de renderizado de la
    sesión anterior -- ver más abajo "Cámara libre"; todo se verificó
    corriendo `sceneManager.update()` en loop manual y midiendo posición/
    velocidad real, igual que en fases anteriores):
    1. Un primer diseño usaba `input.backward` para "frenar" en curva
       cerrada. Con velocidad cinemática 0 (auto recién largado o
       detenido), `backward` no frena -- dispara marcha atrás de verdad
       (ver `VehicleController._applyKinematicHandling`). Como retroceder
       no aleja al auto de la curva cerrada que disparó el freno, quedaba
       en loop infinito acelerando en reversa sin límite. Fix: nunca usar
       `backward` para esto: soltar el acelerador (ni forward ni
       backward) alcanza vía fricción natural (`MK_COAST_DECEL`).
    2. Un segundo diseño decidía acelerar/soltar según un umbral fijo de
       curvatura de la pista (sin mirar la velocidad actual). Un bot
       parado en un tramo de curvatura alta (ej. recién largado) nunca
       superaba el umbral para "arrancar" -- se quedaba trabado
       esperando a que la curvatura mejorase sola, cosa que nunca pasa si
       no se mueve. Fix: comparar contra la velocidad segura calculada a
       partir de la curvatura, no la curvatura sola -- un auto detenido
       siempre está por debajo de su propia velocidad segura, así que
       siempre acelera.
    3. Con una sola ventana larga de curvatura (12m), una curva corta y
       cerrada quedaba diluida/promediada con el tramo recto alrededor,
       y el bot llegaba a un tramo bastante más cerrado de lo que esa
       medición "veía" sin haber frenado lo suficiente. Fix: probar la
       curvatura puntual en varias distancias (`PROBE_DISTANCES`) y
       quedarse con la más exigente, en vez de una sola medición
       agregada.
    4. **El más serio, y el que explicaba casi toda la inestabilidad
       restante**: con más de un auto en pista, los bots salían volando
       de forma caótica (velocidades y posiciones sin sentido) aun
       después de arreglar los tres anteriores, pero un solo bot solo en
       la pista manejaba perfecto. Se probó primero que no fuera colisión
       real de cuerpos: `VehicleController` ahora crea los colliders del
       chasis con `setCollisionGroups` para que los autos no choquen
       entre sí (`CAR_COLLISION_GROUPS`) -- no alcanzó. La causa real:
       `DynamicRayCastVehicleController.updateVehicle()` (Rapier) hace su
       propio raycast por rueda para la suspensión, con un parámetro
       `filterGroups` **aparte** del `collisionGroups` del collider --
       si no se pasa, el raycast de la rueda de un auto puede pegarle al
       costado del chasis de OTRO auto (no al piso), y la suspensión
       calcula una fuerza sin sentido a partir de esa normal/distancia
       de contacto equivocada. Con un solo auto nunca había otro chasis
       que pudiera estorbar, por eso no se notaba. Fix: pasar el mismo
       `CAR_COLLISION_GROUPS` como `filterGroups` en
       `updateVehicle(fixedDt, 0, CAR_COLLISION_GROUPS)`.
  - **Verificado** (Monza, 3 bots + jugador parado en la largada, 60s
    simulados): sin el fix #4, los bots terminaban a 150-235 unidades de
    la pista con velocidades sin sentido; con los 4 fixes, quedan acotados
    (máximo 23-40 unidades en el peor momento, 8-29% del tiempo fuera de
    asfalto) y completan 4 a 6 vueltas en los 60s. En Mónaco (la pista más
    angosta y técnica, curvas de ~6-7m de radio) el resultado es peor
    (60-81% fuera de asfalto) pero los bots igual completan varias vueltas
    -- no quedan trabados ni se rompen, cornerean peor. **Queda como
    ajuste pendiente para una sesión futura**: no se siguió ajustando a
    ciegas más allá de este punto (`SAFETY_MARGIN`/`LATERAL_CORRECTION_
    GAIN` en `AIDriver.js` son los primeros parámetros para tocar) porque
    el sistema resultó ser sensible/caótico cerca del límite de agarre en
    curva -- cambios chicos en los parámetros a veces empeoraban el
    resultado de forma no intuitiva, confirmado repitiendo corridas.
  - **Cámara libre de debug (tecla `C`)**: agregada en esta misma sesión,
    antes de arrancar la Fase 5, para poder inspeccionar la pista con
    OrbitControls ante la duda de si el asfalto se veía. `Engine.js` la
    prende/apaga con `C`; arranca en vista aérea del centro del mundo
    `(0, 140, 0.01)` mirando a `(0,0,0)` (todas las pistas quedan
    centradas ahí). Con la cámara libre activa no se llama a
    `SceneManager.updateCamera` (el auto se sigue manejando con WASD en
    el fondo, solo se desacopla la cámara).

## Falta (fases siguientes)

- Fase 6: catálogo de 20+ autos + economía de monedas.
- Fase 7: Garage y Tienda.
- Fase 8: menú principal + HUD estilo GT7.
- Fase 9: pantalla dividida (2 jugadores).
- Fase 10: soporte de Gamepad API.
- Fase 11: reemplazo de placeholders por modelos/texturas reales.
- Fase 12: audio, guardado, rendimiento, pulido final.

## Decisiones tomadas

- **Stack**: Three.js + Rapier (`-compat`, sin plugin especial en
  Vite) + Vite + JS puro (ES Modules), sin frameworks de UI. HUD/menús
  con DOM+CSS plano (no se justifica una librería para este alcance).
  Audio con Howler.js, implementado recién en la Fase 12 (decisión
  explícita: priorizar física/IA/contenido primero).
- **Nombres de autos y pistas**: mezcla de autos con marca real y autos
  ficticios de películas/juegos (ej. DeLorean de *Volver al Futuro*).
  Riesgo de marca/IP aceptado explícitamente para este proyecto
  personal que corre 100% local. Cada auto en `cars.json` lleva
  `type: "real" | "fictional"` y, si es ficticio, `franchise` con la
  referencia. Documentar esto ante cualquier intención futura de
  distribuir el juego públicamente.
- **Economía**: `coins = round(baseReward × posMult(pos) × lapMult(laps) × difficultyMultiplier) + 10`
  con `posMult(pos) = pos==1 ? 1.0 : max(0.1, 1 - (pos-1)×0.12)` y
  `lapMult(laps) = 1 + (laps-5)×0.05`. Los multiplicadores de
  dificultad viven en `difficulty.json`.
- **Estructura de carpetas**: la acordada en la Fase 0, con dos
  agregados sobre la propuesta original: `src/state/GameState.js`
  (estado en memoria compartido entre pantallas, aún no creado — se
  agrega cuando haya más de una pantalla que lo necesite) y
  `src/config/constants.js` (para cuando haya tuning que centralizar
  más allá de lo que hoy vive en `Car.js`/`Track.js`).
- **`tracks.json`** (revisado en la Fase 4): la idea original de la
  Fase 0 era metadata liviana en `tracks.json` + datos pesados
  (waypoints) en un archivo por pista. Terminó siendo un solo
  `tracks.json` con 15 entradas: cada trazado se genera en runtime a
  partir de unos pocos parámetros de ruido reproducible (`generator`:
  `numPoints`/`radiusX`/`radiusZ`/`variation`/`seed`, ver
  `generateLoop.js`) en vez de una lista de waypoints a mano, así que ya
  no hay "dato pesado" que separar — un archivo por pista habría sido
  puro overhead. Si en una fase futura se pasa a trazados dibujados a
  mano (waypoints reales en vez de siluetas generadas), ahí sí conviene
  volver al archivo por pista.
- **Física del auto (Fase 2)**: masa, fuerzas de motor/freno y grip son
  todos placeholders "tipo auto deportivo liviano" (no vienen de
  `cars.json` porque el catálogo recién se arma en la Fase 6). Viven
  como constantes al principio de `VehicleController.js`, documentadas
  y fáciles de ajustar — el grip del tren trasero es a propósito un
  poco menor al delantero (permite el derrape con tracción trasera).
- **Manejo normal (Fase 2, revisado)**: cinemático puro ("a lo Mario
  Kart"), no sale de física de neumáticos — fue un pedido explícito del
  usuario después de probar la versión con fricción real. El derrape
  sigue siendo la única parte con física real de neumáticos, a
  propósito. Ver el detalle largo en "Hecho" arriba.
- **Superficie (Fase 3, confirmado en la Fase 4)**: se sigue calculando
  geométricamente (`Track.getTrackInfo`/`getSurfaceTypeAt`) en vez de
  con colliders físicos separados — la generalización de `Track.js` a
  trazados arbitrarios (Fase 4) mantuvo el mismo enfoque: distancia al
  punto muestreado más cercano de la curva, más una lista opcional de
  `surfaceZones` (rangos de `t`) para tramos mixtos dentro del propio
  trazado. No hizo falta cambiar de enfoque como se anticipaba.

## Cómo probar el estado actual

```bash
cd racing-game
npm install
npm run dev
```

Abrir la URL que imprime Vite (por defecto `http://localhost:5173`).
Arranca en Monza (asfalto gris, ambiente de día despejado). El manejo
normal (W/S/A/D o flechas) es cinemático tipo Mario Kart: acelera/frena/
da marcha atrás sin perder velocidad al doblar. `Espacio` es freno de
mano (frenada seca); `Shift` es el derrape (mantenelo doblando a buena
velocidad para deslizar controladamente y cargar la barra de turbo que
aparece abajo al centro — soltalo para disparar el turbo); `P`
activa/desactiva la física de transferencia de peso (debug).

Nuevo de la Fase 4 — todavía atrás de teclas de debug porque el menú es
la Fase 8: `N` pasa a la siguiente de las 15 pistas (probá varias para
ver lo distinto que se siente cada ambiente — Costa Turquesa/playa,
Cráter Lunar, Cumbre Nevada/hielo son los más notorios), `L` cicla la
cantidad de vueltas de la carrera (5/10/15), `K` cicla la dificultad. La
segunda línea de HUD muestra pista/vuelta/dificultad actuales.

Todavía no hay límites de pista — el auto puede salirse del trazado
libremente — pero desde la Fase 3 sí hay diferencia real al hacerlo: la
velocidad máxima, la aceleración y el giro bajan notoriamente, y el
derrape se vuelve mucho más resbaladizo (más todavía en hielo que en
pasto/arena).

Nuevo de la Fase 5: arranca con 3 bots de IA (autos de colores,
distintos del rojo del jugador) manejando solos por la pista. `B` cicla
la cantidad (0/3/6/9). Cornerean bien en pistas anchas/rápidas (Monza,
Silverstone); en las más técnicas y angostas (Mónaco sobre todo) se
salen de pista seguido, aunque no quedan trabados ni rompen nada —
completan vueltas igual, solo cortan mal las curvas cerradas. Ver el
detalle en "Hecho" arriba si hace falta seguir afinando
`SAFETY_MARGIN`/`LATERAL_CORRECTION_GAIN` en `AIDriver.js`.

Nuevo también: `C` activa/desactiva una cámara libre (OrbitControls —
arrastrar para orbitar, rueda para zoom) para inspeccionar la pista
desde cualquier ángulo sin depender de la cámara en tercera persona.

Nota para la próxima sesión: el panel de navegador integrado de este
entorno sigue sin poder tomar screenshots interactivos ("the page is
not compositing frames"), pero **sí se puede verificar visualmente
igual** con la técnica encontrada al arreglar el bug del asfalto
invisible (ver el bloque "Cuarta causa" en Fase 4 más arriba): forzar
un resize (`window.dispatchEvent(new Event('resize'))`), exponer
`window.__engine` temporalmente y llamar `engine._tick()` a mano varias
veces (rAF no dispara solo porque `document.hidden` es `true` en este
panel), y leer colores de pixeles reales del canvas proyectando puntos
del mundo a pantalla con `Vector3.project(camera)`. Es más confiable
que una captura para verificar bugs de renderizado puntuales (colores/
visibilidad de una superficie en un punto exacto), aunque no reemplaza
ver la animación completa a simple vista. Para física/IA en el tiempo,
sigue siendo mejor `sceneManager.update()` en loop manual leyendo
estado real (posición, velocidad, `t` sobre la curva) — ver el patrón
usado en la Fase 5.
