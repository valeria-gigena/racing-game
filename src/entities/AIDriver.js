import { MK_MAX_SPEED, MK_TURN_RATE_MAX } from '../physics/VehicleController.js';

// IA simple "por waypoints" (Fase 5): no tiene ruta propia, reusa la misma
// curva que Track ya calcula para dibujar el asfalto y contar vueltas
// (Track.getPointAhead). Cada frame mira varios puntos adelante sobre esa
// curva -- uno cerca (para saber hacia donde doblar) y varios mas lejos,
// a distintas distancias (para encontrar la curva mas cerrada dentro del
// horizonte de frenado y soltar el acelerador a tiempo) -- y devuelve un
// objeto con la MISMA forma que el estado de InputManager, para que
// VehicleController no tenga que distinguir si el input vino de teclado o
// de un bot.

const STEER_LOOKAHEAD = 8; // metros adelante sobre la curva, para decidir hacia donde doblar
const STEER_DEADZONE = 0.05; // rad (~3 grados): por debajo de esto no corrige, evita temblor
// Cuanto se corrige el punto de direccion hacia el centro de la pista por
// cada metro de error lateral actual (ver mas abajo). Apuntar solo a un
// punto "adelante sobre la curva" sin esto no tiene ningun termino que
// tire al auto de vuelta al centro: si por lo que sea ya esta corrido
// unos metros hacia un lado, el punto objetivo queda casi en la misma
// direccion en la que ya viene (esta tan lejos como el error lateral es
// chico comparado con el lookahead), la correccion es minima, y con la
// pista real (irregularidades del generador de ruido, no una recta
// perfecta) alcanza para que el error crezca en vez de corregirse -- se
// confirmo simulando: el auto terminaba con el volante trabado a fondo
// girando en circulo, alejandose cada vez mas. Nombre tecnico: esto es
// "pure pursuit" con correccion de error transversal.
const LATERAL_CORRECTION_GAIN = 0.3;

// Horizonte de frenado: distancias a las que se prueba la curvatura
// puntual de la pista. Un solo punto lejano (probado primero, y que se
// saco) promedia/diluye una curva corta y cerrada con el tramo recto de
// alrededor -- un bot llegaba a una curva bastante mas cerrada de lo que
// esa medicion "veia" y se salia de pista antes de que el freno
// reaccionara (confirmado simulando: ver PROGRESS.md). Probar varias
// distancias y quedarse con la mas exigente (radio mas chico -> velocidad
// seguridad mas baja) encuentra la curva mas cerrada este donde este
// dentro del horizonte, en vez de promediarla con lo que la rodea.
const PROBE_DISTANCES = [4, 8, 12, 16, 20, 25, 30, 35, 40];
// ventana CORTA para medir la curvatura puntual en cada distancia de
// prueba (no confundir con las distancias de arriba, que son donde se
// prueba, no cuanto arco se mide en cada prueba)
const CURVATURE_EPSILON = 2;

// deja margen contra el limite fisico exacto (no corta el acelerador
// justo al borde). Se ajusto de 0.8 a 0.65 despues de simular: con 0.8 el
// primer auto en salir de la largada llegaba a la primera curva cerrada
// todavia a velocidad maxima (25+ unidades fuera de pista en el momento
// mas alejado) porque a 26 m/seg (tope) el horizonte de frenado de arriba
// alcanza para desacelerar, pero con poco margen -- con 0.65 esa misma
// curva se toma sin salirse.
const SAFETY_MARGIN = 0.65;

export class AIDriver {
  constructor({ speedMultiplier = 1 } = {}) {
    this.speedMultiplier = speedMultiplier;
  }

  computeInput(car, track) {
    const { t } = track.getTrackInfo(car.position.x, car.position.z);

    // error lateral con signo (a diferencia de getTrackInfo().distance,
    // que no dice de que lado): distancia del auto al centro de la pista
    // proyectada sobre el vector "right" del punto AHORA, no del punto de
    // adelante -- positivo = corrido hacia la derecha de la pista.
    const now = track.getPointAhead(t, 0);
    const lateralError =
      (car.position.x - now.point.x) * now.right.x + (car.position.z - now.point.z) * now.right.z;

    const steerTarget = track.getPointAhead(t, STEER_LOOKAHEAD);
    // el punto objetivo se corre hacia el centro en proporcion al error
    // lateral actual -- ver LATERAL_CORRECTION_GAIN.
    const aimPoint = {
      x: steerTarget.point.x - lateralError * LATERAL_CORRECTION_GAIN * steerTarget.right.x,
      z: steerTarget.point.z - lateralError * LATERAL_CORRECTION_GAIN * steerTarget.right.z
    };
    const toTarget = {
      x: aimPoint.x - car.position.x,
      z: aimPoint.z - car.position.z
    };
    const angleToTarget = Math.atan2(toTarget.x, toTarget.z);
    const steerError = normalizeAngle(angleToTarget - car.getHeading());

    // Velocidad segura para el radio de giro mas cerrado que viene: mismo
    // modelo fisico que gobierna al jugador (radio = velocidad / tasa de
    // giro, ver VehicleController.MK_TURN_RATE_MAX), asi que un bot mas
    // rapido que esto no llegaria a doblar a tiempo. A diferencia de un
    // umbral de curvatura fijo, esto compara contra la velocidad ACTUAL
    // del auto en vez de solo la forma de la pista: un auto parado en una
    // curva cerrada (recien largado, por ejemplo) siempre esta por debajo
    // de su propia velocidad segura, asi que siempre acelera -- nunca se
    // queda trabado esperando a que la curvatura "mejore" sola, que era
    // lo que pasaba con un umbral fijo de curvatura (ver PROGRESS.md).
    let safeSpeedMs = MK_MAX_SPEED;
    for (const distance of PROBE_DISTANCES) {
      const a = track.getPointAhead(t, distance);
      const b = track.getPointAhead(t, distance + CURVATURE_EPSILON);
      const yawA = Math.atan2(a.tangent.x, a.tangent.z);
      const yawB = Math.atan2(b.tangent.x, b.tangent.z);
      const localCurvature = Math.abs(normalizeAngle(yawB - yawA));
      const radius = CURVATURE_EPSILON / Math.max(localCurvature, 1e-4);
      const probeSafeSpeed = Math.min(MK_MAX_SPEED, radius * MK_TURN_RATE_MAX * SAFETY_MARGIN);
      if (probeSafeSpeed < safeSpeedMs) safeSpeedMs = probeSafeSpeed;
    }
    safeSpeedMs *= this.speedMultiplier;

    const currentSpeedMs = car.getSpeedKmh() / 3.6;

    return {
      forward: currentSpeedMs < safeSpeedMs,
      backward: false,
      left: steerError > STEER_DEADZONE,
      right: steerError < -STEER_DEADZONE,
      handbrake: false,
      drift: false,
      toggleWeightTransfer: false
    };
  }
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
