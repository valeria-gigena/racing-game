// Envoltorio sobre el DynamicRayCastVehicleController de Rapier: crea el
// chasis (rigid body + collider) y las 4 ruedas, y traduce el input del
// jugador (acelerar/frenar/girar) en fuerzas por rueda cada frame.
//
// Las dimensiones de acá son las mismas que usa Car.js para el mesh
// placeholder, para que el collider y lo que se ve coincidan. Cuando en
// la Fase 11 se reemplace el placeholder por un modelo real, estas
// constantes son las que hay que ajustar para que calcen con el modelo.

import { getSurface, DEFAULT_SURFACE } from './SurfaceTypes.js';

export const CHASSIS_HALF_EXTENTS = { x: 0.9, y: 0.28, z: 1.8 };
export const WHEEL_RADIUS = 0.35;
const SUSPENSION_REST_LENGTH = 0.32;
const WHEEL_ATTACH_Y = -0.35; // relativo al centro del chasis
const WHEEL_HALF_TRACK = 0.78; // separacion del centro al eje de cada rueda (ancho)
const WHEEL_FRONT_Z = 1.25;
const WHEEL_REAR_Z = -1.25;

// altura a la que hay que spawnear el chasis para que las ruedas queden
// cerca del piso sin clipear (Car.js la usa para calcular la posicion inicial)
export const CHASSIS_SPAWN_HEIGHT =
  -WHEEL_ATTACH_Y + SUSPENSION_REST_LENGTH + WHEEL_RADIUS + 0.05;

const CHASSIS_MASS = 1150; // kg, placeholder tipo auto deportivo liviano

// Fase 5: los autos (jugador + hasta 9 bots) NO chocan entre si a nivel
// fisico, aunque sus mallas se puedan superponer visualmente. Se probo
// dejarlos chocar de verdad (comportamiento por default de Rapier) y un
// bot de IA que pasaba por donde el auto del jugador esta parado (ej. la
// linea de largada, apenas arranca la carrera) salia disparado de forma
// catastrofica -- la velocidad cinematica del manejo normal (ver
// VehicleController._applyKinematicVelocity, que fuerza linvel cada
// frame) pelea contra el impulso de contacto que aplica el solver de
// Rapier en el mismo frame, y el resultado es una respuesta caotica, no
// un choque razonable. Resolver colisiones auto-contra-auto de verdad
// (que se empujen/derrapen entre si en vez de atravesarse) es un problema
// mas de fondo que no entra en el alcance de esta fase -- se deja para
// cuando haga falta (competencia real entre bots, Fase 9 con el
// jugador). `setCollisionGroups` con esta mascara hace que el collider
// del chasis siga chocando con todo lo demas (piso, en el futuro
// obstaculos) pero no con otros chasis: memberships = bit 0 (son todos
// "autos"), filter = todos los bits menos el 0 (no interactuan entre
// miembros del mismo grupo). Formato exacto en interaction_groups.d.ts
// de rapier3d-compat: 16 bits altos = memberships, 16 bits bajos = filtro.
const CAR_COLLISION_GROUPS = (0x0001 << 16) | 0xfffe;

// compression/relaxation son coeficientes de amortiguacion (deben quedar
// bien por debajo de 1, no son un multiplicador de fuerza): valores altos
// hacen que la suspension "explote" en vez de amortiguar, lo que lanzaba
// el auto por el aire al frenar fuerte.
const SUSPENSION_TUNING = {
  suspensionStiffness: 24,
  suspensionCompression: 0.83,
  suspensionRelaxation: 0.9,
  maxSuspensionTravel: 0.24,
  maxSuspensionForce: 100000
};

// el tren trasero agarra un poco menos de lado que el delantero a propósito:
// con traccion trasera, eso es lo que permite que largue el tren trasero
// (sobreviraje) al tomar una curva rapida o tirar de freno de mano, en vez
// de que el auto quede pegado al piso sin ningun derrape.
const FRONT_GRIP = { frictionSlip: 1.9, sideFrictionStiffness: 1.9 };
const REAR_GRIP = { frictionSlip: 1.85, sideFrictionStiffness: 1.35 };

// OJO: en esta version de rapier3d-compat, setWheelBrake NO esta en la
// misma escala que setWheelEngineForce (no son ambos "newtons" tal cual
// dice el tipo) -- un valor de freno de un par de cientos ya frena mucho
// mas fuerte que el motor acelerando a fondo. Valores altos (los que uno
// esperaria por analogia con el motor) desestabilizan la suspension y
// pueden hacer volcar el auto. Estos numeros salieron de probar en el
// navegador, no de la doc. Solo se usa durante el derrape (ver mas abajo
// por que el manejo normal ya no pasa por aca).
const MAX_BRAKE_FORCE = 45;
const HANDBRAKE_FORCE = MAX_BRAKE_FORCE * 1.6;
const MAX_STEER_ANGLE = 0.55; // rad (~31.5°)
// El volante NO va exponencialmente hacia un objetivo (eso hacia que
// CUALQUIER toque, por mas corto que fuera, terminara acercandose al
// angulo maximo -- imposible pedirle un giro chico). Ahora es una rampa
// LINEAL: el angulo crece a una tasa fija mientras se mantiene A/D, asi
// que un toque corto da un giro chico y proporcional, y hay que sostener
// la tecla mas tiempo para llegar a bloqueo maximo. Al soltar, vuelve a
// cero mas rapido de lo que crecio (se centra solo).
const STEER_RATE = 2.6; // rad/seg mientras se mantiene A o D
const STEER_RETURN_RATE = 4.5; // rad/seg al soltar

// Manejo normal (fuera del derrape) "a lo Mario Kart": nada de esto sale
// de friccion de neumaticos ni de fuerza/masa -- es cinematico puro,
// igual que en Mario Kart (y que la Fase 1 de este proyecto, antes de
// meter Rapier). Se probaron dos intentos con friccion real antes de
// llegar aca:
//   1. Nada mas que reducir/subir la velocidad de giro: el auto perdia
//      velocidad al doblar (el agarre lateral de las gomas le "roba"
//      impulso, como en un auto real) -- Mario Kart no hace eso.
//   2. Forzar la velocidad angular (yaw) del chasis directamente pero
//      dejar que la velocidad LINEAL se reacomodara sola por friccion:
//      no daba a tiempo, y el auto terminaba patinando de costado en vez
//      de ir para donde mira (medido: hasta 81° de deslizamiento
//      doblando "normal", cuando debería ser 0).
// La solucion final controla velocidad y direccion directamente cada
// frame (ver postPhysicsStep/_applyKinematicVelocity): la rueda solo se
// deja rodar libre, sin motor ni freno, para que la suspension/contacto
// con el piso siga funcionando via Rapier. El derrape (Shift) es la
// unica situacion que sigue usando friccion real de neumaticos --
// a proposito, por eso patina distinto y ahi si cuesta velocidad.
// el tope de velocidad se eligio para que coincida con el rango de
// entrada al derrape ya afinado (DRIFT_BRAKE_FORCE, DRIFT_REAR_SIDE_GRIP,
// etc.): a mas velocidad de la que traia cuando se afino, el mismo freno
// de derrape tarda mucho mas en romper agarre -- se probo con el tope mas
// alto (30 m/s) y el desliz maximo bajaba de ~30° a menos de 9° en un
// derrape de 4 segundos.
// Exportadas (no solo el jugador las necesita): AIDriver (Fase 5) las usa
// para calcular la velocidad segura de cada curva a partir del mismo
// radio de giro fisico que gobierna al jugador (velocidad = radio *
// tasa de giro), en vez de inventar un umbral aparte que se podria
// desincronizar de estos valores si se retocan mas adelante.
export const MK_MAX_SPEED = 26; // m/seg (~94 km/h)
const MK_MAX_REVERSE_SPEED = -9;
const MK_ACCEL = 24; // m/seg^2
const MK_BRAKE_DECEL = 34; // frenando de una hacia adelante
const MK_REVERSE_ACCEL = 14;
const MK_COAST_DECEL = 9; // "freno motor" al no tocar nada
const MK_HANDBRAKE_DECEL = 50;
export const MK_TURN_RATE_MAX = 2.3; // rad/seg con el volante a fondo
// Los MK_* de arriba son la base (asfalto). Fase 3: cada superficie
// (ver SurfaceTypes.js) multiplica velocidad maxima/aceleracion/giro. Si
// el auto entra a una superficie mas lenta llevando mas velocidad de la
// que esa superficie permite (ej. de asfalto a pasto a fondo), el exceso
// se suelta gradual a esta tasa en vez de frenar en seco de golpe.
const SURFACE_OVERSPEED_DECEL = 40; // m/seg^2

// Derrape "a lo Mario Kart": tecla dedicada (Shift), separada del freno de
// mano. A diferencia del freno de mano, esto NO frena ni corta el motor
// -- solo reduce el agarre lateral trasero mientras se dobla, asi que el
// deslizamiento es progresivo y controlable en vez del golpe brusco de
// trabar las ruedas de golpe. Mantenerlo dentro de un rango de angulo de
// deslizamiento "bueno" (ni casi derecho ni girando en el lugar) carga un
// turbo por niveles; soltar la tecla dispara el turbo segun cuanto se
// cargo, y perder el control (irse de cola del todo) resetea la carga sin
// premio -- igual que en Mario Kart.
const DRIFT_MIN_SPEED_MS = 8; // no se puede iniciar un derrape casi parado
const DRIFT_REAR_SIDE_GRIP = 1.0; // agarre reducido mientras se sostiene el derrape
// Con el agarre trasero reducido, si las delanteras siguen llegando a
// bloqueo maximo (31.5°) el auto no derrapa en un arco -- gira sobre su
// propio eje (medido: radio de giro de ~6m, velocidad angular de hasta
// 144°/seg). Por eso mientras se derrapa el angulo de las delanteras se
// limita a una fraccion del maximo: menos "tironeo" del frente, arco mas
// ancho y controlable, mas parecido a un derrape real.
const DRIFT_STEER_SCALE = 0.55;
// Ni limitar el angulo de las delanteras ni bajar el freno alcanzaron para
// abrir el arco (medido: seguia dando ~6m de radio, practicamente lo
// mismo) -- en este modelo, una vez que el tren trasero pierde agarre, la
// velocidad angular parece quedar gobernada mas por el momento angular ya
// acumulado que por el input de direccion en curso. Por eso se limita
// directamente: mientras se derrapa, la velocidad angular (yaw) del auto
// no puede superar este valor. Es un límite de "sensación de juego", no
// de física realista, pero es lo único que dio control real del ancho
// del arco.
const DRIFT_MAX_YAW_RATE = 1.1; // rad/seg
const DRIFT_SWEET_SPOT_MIN_DEG = 5;
const DRIFT_SWEET_SPOT_MAX_DEG = 40;
const DRIFT_SPINOUT_DEG = 60; // pasado esto, se considera que se perdio el control
// Ni bajar el agarre lateral solo, ni forzar la velocidad angular (yaw)
// directamente, alcanzan para generar un deslizamiento perceptible en este
// modelo de neumaticos: el solver realinea la velocidad lineal con el
// heading casi al instante mientras la rueda pueda "rodar" con normalidad
// (confirmado probando ambos enfoques). Lo unico que efectivamente rompe
// el agarre en este motor es interferir con la rodada de la rueda con
// freno -- eso es lo que hace que el freno de mano derrape tan fuerte. Y
// resulta que el freno en una rueda no hace nada si esa misma rueda tiene
// motor aplicado a la vez (el motor "gana" sin importar cuanto mas grande
// sea el freno -- lo confirmamos con el bug del freno de mano). Por eso
// el derrape con tecla dedicada tambien corta el motor trasero mientras
// se sostiene (el auto avanza por inercia, no acelera activamente en el
// derrape), pero con un freno mucho mas suave que el del freno de mano
// para que el desliz sea gradual y no un golpe seco.
const DRIFT_BRAKE_FORCE = 15;

// El turbo ahora es un bonus de velocidad cinematico (m/seg) que se suma
// arriba de _kinematicSpeed mientras dura, con rampa de subida/bajada
// (nunca de un salto) -- ya no pasa por fuerza de las ruedas, porque el
// manejo normal dejo de usar esas fuerzas (ver MK_MAX_SPEED de mas arriba).
const BOOST_TIERS = [
  { minChargeTime: 0.5, speedBonus: 7, duration: 0.35 },
  { minChargeTime: 1.2, speedBonus: 11, duration: 0.55 },
  { minChargeTime: 2.2, speedBonus: 16, duration: 0.85 }
];
const BOOST_RAMP_RATE = 5; // que tan rapido sube/baja el bonus cada frame

export class VehicleController {
  constructor(physicsWorld, { position, heading }) {
    this.physicsWorld = physicsWorld;
    const RAPIER = physicsWorld.RAPIER;
    const world = physicsWorld.world;

    // Un cuboide uniforme (masa repartida por igual en todo el volumen)
    // subestima muchisimo la resistencia real de un auto a volcarse o
    // "clavar el naso": un auto real tiene la masa concentrada abajo
    // (motor, chasis, bateria), lo que le da mucha mas inercia rotacional
    // en cabeceo/vuelco que una caja hueca del mismo tamaño. Sin este
    // ajuste, frenar fuerte alcanzaba para lanzar el auto por el aire y
    // volcarlo. Se calcula el tensor de inercia de la caja y se lo escala
    // por eje para simular un centro de masa mas bajo sin cambiar la
    // forma visual/de colision.
    const { x: hx, y: hy, z: hz } = CHASSIS_HALF_EXTENTS;
    const baseInertia = {
      pitch: (CHASSIS_MASS / 3) * (hy * hy + hz * hz), // rotacion sobre el eje X (cabeceo, frenada/arranque)
      yaw: (CHASSIS_MASS / 3) * (hx * hx + hz * hz), // rotacion sobre el eje Y (giro, derrape)
      roll: (CHASSIS_MASS / 3) * (hx * hx + hy * hy) // rotacion sobre el eje Z (vuelco lateral)
    };
    const principalAngularInertia = {
      x: baseInertia.pitch * 4.5,
      y: baseInertia.yaw * 1.2,
      z: baseInertia.roll * 8
    };

    const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y + CHASSIS_SPAWN_HEIGHT, position.z)
      .setRotation(yawToQuaternion(heading))
      .setLinearDamping(0.25)
      .setAngularDamping(0.15)
      .setAdditionalMassProperties(
        CHASSIS_MASS,
        { x: 0, y: 0, z: 0 },
        principalAngularInertia,
        { x: 0, y: 0, z: 0, w: 1 }
      );
    this.chassisBody = world.createRigidBody(chassisDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      CHASSIS_HALF_EXTENTS.x,
      CHASSIS_HALF_EXTENTS.y,
      CHASSIS_HALF_EXTENTS.z
    )
      .setDensity(0) // la masa/inercia ya la define setAdditionalMassProperties de arriba
      .setFriction(0.5)
      .setRestitution(0.05)
      .setCollisionGroups(CAR_COLLISION_GROUPS); // ver comentario en la constante: autos no chocan entre si
    world.createCollider(colliderDesc, this.chassisBody);

    this.rapierController = world.createVehicleController(this.chassisBody);
    this.rapierController.indexUpAxis = 1;
    // el setter de este en particular se llama distinto al getter en la
    // API de rapier3d-compat (typo de la librería, no nuestro): es
    // `setIndexForwardAxis`, no `indexForwardAxis`.
    this.rapierController.setIndexForwardAxis = 2;

    this.wheels = [
      { x: -WHEEL_HALF_TRACK, z: WHEEL_FRONT_Z, steer: true, drive: false },
      { x: WHEEL_HALF_TRACK, z: WHEEL_FRONT_Z, steer: true, drive: false },
      { x: -WHEEL_HALF_TRACK, z: WHEEL_REAR_Z, steer: false, drive: true },
      { x: WHEEL_HALF_TRACK, z: WHEEL_REAR_Z, steer: false, drive: true }
    ];

    const suspensionDir = { x: 0, y: -1, z: 0 };
    const axle = { x: -1, y: 0, z: 0 };

    this.wheels.forEach((wheel, i) => {
      this.rapierController.addWheel(
        { x: wheel.x, y: WHEEL_ATTACH_Y, z: wheel.z },
        suspensionDir,
        axle,
        SUSPENSION_REST_LENGTH,
        WHEEL_RADIUS
      );
      this.rapierController.setWheelSuspensionStiffness(i, SUSPENSION_TUNING.suspensionStiffness);
      this.rapierController.setWheelSuspensionCompression(i, SUSPENSION_TUNING.suspensionCompression);
      this.rapierController.setWheelSuspensionRelaxation(i, SUSPENSION_TUNING.suspensionRelaxation);
      this.rapierController.setWheelMaxSuspensionTravel(i, SUSPENSION_TUNING.maxSuspensionTravel);
      this.rapierController.setWheelMaxSuspensionForce(i, SUSPENSION_TUNING.maxSuspensionForce);

      const grip = wheel.drive ? REAR_GRIP : FRONT_GRIP;
      this.rapierController.setWheelFrictionSlip(i, grip.frictionSlip);
      this.rapierController.setWheelSideFrictionStiffness(i, grip.sideFrictionStiffness);
    });

    this._currentSteerAngle = 0;

    this._driftActive = false;
    this._driftChargeTime = 0;
    this._boostTimeRemaining = 0;
    this._boostTargetBonus = 0;
    this._currentBoostBonus = 0;

    // velocidad "cinematica" (m/seg, con signo: negativo = marcha atras)
    // que gobierna el manejo normal -- ver comentario en MK_MAX_SPEED
    this._kinematicSpeed = 0;

    // debug: tecla P saca la fisica de transferencia de peso (cabeceo al
    // frenar/acelerar, vuelco en curva) sin tocar nada mas del manejo
    this._weightTransferEnabled = true;
    this._prevToggleWeightTransferKey = false;

    // superficie bajo el auto (Fase 3) -- Car.js la actualiza cada frame
    // via applyInput segun la posicion actual (ver SceneManager.update)
    this._currentSurface = DEFAULT_SURFACE;
  }

  // Se llama una vez por frame de render: solo decide QUE fuerzas aplicar
  // (no avanza la simulacion, eso lo hace PhysicsWorld en pasos fijos).
  applyInput(dt, input, surfaceKey) {
    if (input.toggleWeightTransfer && !this._prevToggleWeightTransferKey) {
      this._weightTransferEnabled = !this._weightTransferEnabled;
    }
    this._prevToggleWeightTransferKey = input.toggleWeightTransfer;

    this._currentSurface = surfaceKey ? getSurface(surfaceKey) : DEFAULT_SURFACE;

    const forwardSpeed = this.rapierController.currentVehicleSpeed();

    const steerInput = input.left ? 1 : input.right ? -1 : 0;
    if (steerInput !== 0) {
      const next = this._currentSteerAngle + steerInput * STEER_RATE * dt;
      this._currentSteerAngle = Math.max(-MAX_STEER_ANGLE, Math.min(MAX_STEER_ANGLE, next));
    } else if (this._currentSteerAngle !== 0) {
      const sign = Math.sign(this._currentSteerAngle);
      const next = this._currentSteerAngle - sign * STEER_RETURN_RATE * dt;
      this._currentSteerAngle = Math.sign(next) === sign ? next : 0; // no pasarse de cero de vuelta
    }

    this._updateDrift(dt, input, forwardSpeed);

    // turbo: sube y baja con rampa (nunca de un salto) -- ver BOOST_TIERS
    if (this._boostTimeRemaining > 0) {
      this._boostTimeRemaining = Math.max(0, this._boostTimeRemaining - dt);
      if (this._boostTimeRemaining === 0) this._boostTargetBonus = 0;
    }
    const boostT = Math.min(1, BOOST_RAMP_RATE * dt);
    this._currentBoostBonus += (this._boostTargetBonus - this._currentBoostBonus) * boostT;

    if (this._driftActive) {
      this._applyDriftPhysics(input);
    } else {
      this._applyKinematicHandling(dt, input);
    }
  }

  // Derrape: sigue siendo 100% fisica real de neumaticos (a proposito, es
  // la unica parte del manejo que no se copio de Mario Kart).
  _applyDriftPhysics(input) {
    const forwardSpeed = this.rapierController.currentVehicleSpeed();
    const brakeForce = input.backward && forwardSpeed > 1 ? MAX_BRAKE_FORCE : 0;
    const rearHandbrakeForce = input.handbrake ? HANDBRAKE_FORCE : 0;

    // limite directo de velocidad angular en yaw (ver DRIFT_MAX_YAW_RATE).
    // Ojo: tocar SOLO el eje Y y dejar cabeceo/vuelco (X/Z) intactos
    // resultaba en que se acumulaba velocidad angular en esos ejes
    // durante el derrape sin que se notara, y el auto terminaba
    // volcandose varios segundos DESPUES de soltar la tecla. Por eso
    // mientras se derrapa tambien se amortigua fuerte X/Z: el auto se
    // mantiene plano durante todo el derrape, no solo al principio.
    const angvel = this.chassisBody.angvel();
    const clampedYaw =
      Math.abs(angvel.y) > DRIFT_MAX_YAW_RATE ? Math.sign(angvel.y) * DRIFT_MAX_YAW_RATE : angvel.y;
    this.chassisBody.setAngvel({ x: angvel.x * 0.5, y: clampedYaw, z: angvel.z * 0.5 }, true);

    const steerAngle = this._currentSteerAngle * DRIFT_STEER_SCALE;

    // Fase 3: fuera de asfalto, el agarre de los neumaticos baja segun
    // SurfaceTypes.js -- en pasto/tierra el derrape se va de cola mucho
    // mas facil, con menos margen de recuperacion.
    const grip = this._currentSurface.gripMultiplier;
    const rearSideGrip = DRIFT_REAR_SIDE_GRIP * grip;
    const rearFrictionSlip = REAR_GRIP.frictionSlip * grip;
    const frontSideGrip = FRONT_GRIP.sideFrictionStiffness * grip;
    const frontFrictionSlip = FRONT_GRIP.frictionSlip * grip;

    this.wheels.forEach((wheel, i) => {
      this.rapierController.setWheelEngineForce(i, 0); // el auto avanza por inercia mientras dura el derrape
      this.rapierController.setWheelBrake(
        i,
        wheel.drive ? Math.max(brakeForce, rearHandbrakeForce, DRIFT_BRAKE_FORCE) : brakeForce
      );
      this.rapierController.setWheelSteering(i, wheel.steer ? steerAngle : 0);
      this.rapierController.setWheelSideFrictionStiffness(i, wheel.drive ? rearSideGrip : frontSideGrip);
      this.rapierController.setWheelFrictionSlip(i, wheel.drive ? rearFrictionSlip : frontFrictionSlip);
    });
  }

  // Manejo normal: cinematico puro (ver el comentario grande en
  // MK_MAX_SPEED de por que). Las ruedas quedan sin fuerza -- la
  // velocidad/direccion las fija directamente postPhysicsStep una vez que
  // Rapier ya proceso gravedad/suspension para este frame.
  _applyKinematicHandling(dt, input) {
    // Fase 3: la superficie actual escala velocidad maxima/aceleracion/
    // giro -- ver SurfaceTypes.js. El frenado (normal y de mano) se deja
    // igual en todas las superficies a proposito: frenar sigue frenando.
    const surface = this._currentSurface;
    const maxSpeed = MK_MAX_SPEED * surface.maxSpeedMultiplier;
    const maxReverseSpeed = MK_MAX_REVERSE_SPEED * surface.maxSpeedMultiplier;
    const accel = MK_ACCEL * surface.accelMultiplier;
    const reverseAccel = MK_REVERSE_ACCEL * surface.accelMultiplier;
    const turnRate = MK_TURN_RATE_MAX * surface.turnRateMultiplier;

    const steerRatio = this._currentSteerAngle / MAX_STEER_ANGLE; // -1..1
    const angvel = this.chassisBody.angvel();
    this.chassisBody.setAngvel({ x: angvel.x, y: steerRatio * turnRate, z: angvel.z }, true);

    if (input.forward) {
      this._kinematicSpeed += accel * dt;
    } else if (input.backward) {
      if (this._kinematicSpeed > 0) {
        this._kinematicSpeed -= MK_BRAKE_DECEL * dt;
      } else {
        this._kinematicSpeed -= reverseAccel * dt;
      }
    } else if (Math.abs(this._kinematicSpeed) <= MK_COAST_DECEL * dt) {
      this._kinematicSpeed = 0;
    } else {
      this._kinematicSpeed -= Math.sign(this._kinematicSpeed) * MK_COAST_DECEL * dt;
    }

    if (input.handbrake) {
      const dec = MK_HANDBRAKE_DECEL * dt;
      if (Math.abs(this._kinematicSpeed) <= dec) this._kinematicSpeed = 0;
      else this._kinematicSpeed -= Math.sign(this._kinematicSpeed) * dec;
    }

    // tope de la superficie actual: si el auto ya traia mas velocidad de
    // la que esta superficie permite (por ejemplo, entrando de asfalto a
    // pasto a fondo), el exceso se suelta gradual en vez de frenar en
    // seco de golpe -- ver SURFACE_OVERSPEED_DECEL.
    if (this._kinematicSpeed > maxSpeed) {
      this._kinematicSpeed = Math.max(maxSpeed, this._kinematicSpeed - SURFACE_OVERSPEED_DECEL * dt);
    } else if (this._kinematicSpeed < maxReverseSpeed) {
      this._kinematicSpeed = Math.min(maxReverseSpeed, this._kinematicSpeed + SURFACE_OVERSPEED_DECEL * dt);
    }

    this.wheels.forEach((wheel, i) => {
      this.rapierController.setWheelEngineForce(i, 0);
      this.rapierController.setWheelBrake(i, 0);
      this.rapierController.setWheelSteering(i, 0);
    });
  }

  _updateDrift(dt, input, forwardSpeed) {
    const turning = Math.abs(this._currentSteerAngle) > 0.08;
    // sin motor, el derrape frena el auto solo -- si exigieramos la misma
    // velocidad minima para SOSTENERLO que para arrancarlo, un derrape
    // prolongado terminaria cancelandose el mismo a mitad de camino (y
    // perdiendo toda la carga) apenas la desaceleracion natural lo cruzara.
    // El minimo alto solo aplica para *iniciar* un derrape nuevo.
    const speedFloor = this._driftActive ? 2 : DRIFT_MIN_SPEED_MS;
    const wantsDrift = input.drift && forwardSpeed > speedFloor && turning;

    if (wantsDrift) {
      this._driftActive = true;

      const slipDeg = this._computeSlipAngleDeg();
      if (slipDeg >= DRIFT_SWEET_SPOT_MIN_DEG && slipDeg <= DRIFT_SWEET_SPOT_MAX_DEG) {
        this._driftChargeTime += dt;
      } else if (slipDeg > DRIFT_SPINOUT_DEG) {
        this._driftChargeTime = 0; // se fue de cola del todo: sin premio
      }
    } else {
      if (this._driftActive) {
        this._triggerBoostFromCharge();
        // al volver al manejo cinematico, arranca desde la velocidad real
        // que traia el auto (sino habria un salto/frenon al soltar el
        // derrape)
        this._kinematicSpeed = this.rapierController.currentVehicleSpeed();
      }
      this._driftActive = false;
      this._driftChargeTime = 0;
    }
  }

  _triggerBoostFromCharge() {
    let chosenTier = null;
    for (const tier of BOOST_TIERS) {
      if (this._driftChargeTime >= tier.minChargeTime) chosenTier = tier;
    }
    if (chosenTier) {
      this._boostTargetBonus = chosenTier.speedBonus;
      this._boostTimeRemaining = chosenTier.duration;
    }
  }

  _computeSlipAngleDeg() {
    const linvel = this.chassisBody.linvel();
    const q = this.chassisBody.rotation();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const forwardSpeed = linvel.x * forward.x + linvel.z * forward.z;
    const lateralSpeed = linvel.x * right.x + linvel.z * right.z;
    return Math.atan2(Math.abs(lateralSpeed), Math.abs(forwardSpeed)) * (180 / Math.PI);
  }

  // Para HUD/feedback: en que nivel de carga esta el derrape actual (0 =
  // ninguno, 1-3 = niveles de turbo ya asegurados si soltara ahora mismo).
  getDriftState() {
    let chargeTier = 0;
    for (const tier of BOOST_TIERS) {
      if (this._driftChargeTime >= tier.minChargeTime) chargeTier++;
    }
    return {
      isDrifting: this._driftActive,
      chargeTier,
      isBoosting: this._boostTimeRemaining > 0
    };
  }

  // Se llama una vez por cada paso fijo de fisica (ver PhysicsWorld.step).
  //
  // OJO, bug encontrado simulando la Fase 5 con varios bots a la vez:
  // `updateVehicle` hace su propio raycast por rueda para la suspension, y
  // ESE raycast no respeta el `collisionGroups` del collider (eso solo
  // filtra pares de contacto real) -- tiene su PROPIO parametro
  // `filterGroups`, aparte, que si no se pasa golpea contra CUALQUIER
  // collider de la escena, chasis de otros autos incluido. Con un solo
  // auto en pista nunca se notaba; con varios bots a la vez, la rueda de
  // uno podia "pisar" el costado del chasis de otro y la suspension
  // calculaba una normal/distancia de contacto sin sentido -- eso, no una
  // colision de cuerpos (que ya estaba filtrada), era lo que mandaba a los
  // bots volando de forma caotica. Se le pasa el mismo
  // CAR_COLLISION_GROUPS de los colliders para que las ruedas tambien
  // ignoren otros chasis.
  updatePhysics(fixedDt) {
    this.rapierController.updateVehicle(fixedDt, 0, CAR_COLLISION_GROUPS);
  }

  // Se llama una vez por frame de render, despues de que PhysicsWorld ya
  // avanzo la simulacion. Con la transferencia de peso desactivada, se
  // frena la velocidad angular de cabeceo/vuelco (no se deja acumular)
  // sin tocar aceleracion, frenado, direccion, agarre ni el derrape.
  //
  // OJO: se probo primero tambien re-fijar la ROTACION del chasis a una
  // quaternion pura de yaw cada frame (setRotation), para que quedara
  // perfectamente nivelado siempre -- pero eso rompe el raycast de las
  // ruedas del vehicle controller (que asume que el chasis se mueve por
  // integracion normal del solver, no por saltos de orientacion
  // impuestos desde afuera) y el auto terminaba atravesando el piso. Por
  // eso esto solo toca velocidad angular, nunca la rotacion directamente.
  postPhysicsStep() {
    if (!this._driftActive) this._applyKinematicVelocity();

    if (this._weightTransferEnabled) return;

    const angvel = this.chassisBody.angvel();
    this.chassisBody.setAngvel({ x: 0, y: angvel.y, z: 0 }, true);
  }

  // Fuera del derrape, la velocidad horizontal la fija esto directamente
  // cada frame: magnitud = _kinematicSpeed (+ bonus de turbo), direccion =
  // hacia donde mira el chasis ahora mismo. Nunca hay diferencia entre
  // hacia donde mira el auto y hacia donde se mueve, como en Mario Kart.
  // (La vertical -- Y -- no se toca: esa la sigue manejando Rapier segun
  // la suspension/gravedad de cada frame.)
  _applyKinematicVelocity() {
    const q = this.chassisBody.rotation();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };

    const boostBonus = this._kinematicSpeed >= 0 ? Math.max(0, this._currentBoostBonus) : 0;
    const appliedSpeed = this._kinematicSpeed + boostBonus;

    const linvel = this.chassisBody.linvel();
    this.chassisBody.setLinvel(
      { x: forward.x * appliedSpeed, y: linvel.y, z: forward.z * appliedSpeed },
      true
    );
  }

  getTransform() {
    return {
      position: this.chassisBody.translation(),
      quaternion: this.chassisBody.rotation()
    };
  }

  // Usado al cambiar de pista (Fase 4, tecla de debug N): a diferencia de
  // postPhysicsStep, esto se llama UNA sola vez (no todos los frames), asi
  // que fijar traslacion/rotacion de golpe es seguro -- es lo mismo que
  // hace el constructor al spawnear. Tambien resetea toda velocidad y
  // estado de manejo para no arrastrar impulso/derrape/turbo de la pista
  // anterior a la nueva.
  teleportTo(position, heading) {
    this.chassisBody.setTranslation(
      { x: position.x, y: position.y + CHASSIS_SPAWN_HEIGHT, z: position.z },
      true
    );
    this.chassisBody.setRotation(yawToQuaternion(heading), true);
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this._currentSteerAngle = 0;
    this._driftActive = false;
    this._driftChargeTime = 0;
    this._boostTimeRemaining = 0;
    this._boostTargetBonus = 0;
    this._currentBoostBonus = 0;
    this._kinematicSpeed = 0;
  }

  getSpeedKmh() {
    return this.rapierController.currentVehicleSpeed() * 3.6;
  }

  isWeightTransferEnabled() {
    return this._weightTransferEnabled;
  }

  // Fase 5: los bots de IA se crean/destruyen en runtime (cambia la
  // pista, o el usuario cicla la cantidad de bots con B) -- a diferencia
  // del auto del jugador, que vive toda la sesion y solo se teletransporta.
  // Hay que sacar el controller ANTES que el rigid body (referencia al
  // chasis; sacar el body primero dejaria al controller apuntando a algo
  // ya destruido).
  dispose(physicsWorld) {
    physicsWorld.world.removeVehicleController(this.rapierController);
    physicsWorld.world.removeRigidBody(this.chassisBody);
  }
}

function yawToQuaternion(yaw) {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}
