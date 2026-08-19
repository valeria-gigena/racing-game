import * as THREE from 'three';
import { Car } from '../entities/Car.js';
import { Track } from '../entities/Track.js';
import { AIDriver } from '../entities/AIDriver.js';
import { generateLoopPoints } from '../data/tracks/generateLoop.js';
import { getEnvironment } from '../data/environments.js';
import { getDifficulty, DEFAULT_DIFFICULTY, DIFFICULTY_LEVELS, LAP_OPTIONS } from '../data/difficulty.js';
import TRACKS from '../data/tracks.json';

// Duenio del contenido de la escena (luces, pista, auto) y de la logica
// de camara. Engine.js se encarga del render loop / renderer; este
// modulo no sabe nada de requestAnimationFrame. Tambien orquesta el
// paso de fisica: aplica el input al vehiculo, avanza PhysicsWorld, y
// sincroniza el mesh con el resultado -- en ese orden, cada frame.
//
// Fase 4: ademas de una pista fija, ahora maneja la lista completa de
// pistas (src/data/tracks.json), el cambio entre ellas, el conteo de
// vueltas, y la cantidad de vueltas/dificultad seleccionadas para la
// carrera actual. Todavia no hay menu (eso es la Fase 8): por ahora se
// ciclan con teclas de debug (N/L/K, ver InputManager + Engine).
//
// Fase 5: suma hasta 9 bots de IA (AIDriver) que se manejan solos por la
// pista. Se crean/destruyen en runtime (no viven toda la sesion como el
// auto del jugador) porque tanto la pista como la cantidad de bots pueden
// cambiar.

const CAMERA_OFFSET = new THREE.Vector3(0, 5.5, -9); // detras y arriba del auto
const CAMERA_LOOK_AHEAD = 4;
const CAMERA_LERP = 6; // suavizado, mas alto = camara mas "pegada" al auto

// umbral para detectar que se cruzo la linea de largada (t cerca de 1 ->
// t cerca de 0 entre un frame y el siguiente) sin contar vueltas por
// jitter cerca del punto medio del trazado
const LAP_CROSS_HIGH_T = 0.75;
const LAP_CROSS_LOW_T = 0.25;

// Fase 5: cantidad de bots ciclable con B (sin menu todavia -- Fase 8).
// Colores placeholder solo para distinguirlos del auto del jugador
// (rojo) y entre si a simple vista.
const BOT_COUNT_OPTIONS = [0, 3, 6, 9];
const BOT_COLORS = [0x3a7bd9, 0xd9a13a, 0x3ad98f, 0xa13ad9, 0xd93a6f, 0x3ad9d0, 0xd9d03a, 0x7a3ad9, 0x3ad95a];

export class SceneManager {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this._buildLights();

    this.track = null;
    this.car = null;
    this._botCars = [];
    this._botDrivers = [];
    this._botCountIndex = 1; // arranca en 3 bots

    this._prevNextTrackKey = false;
    this._prevCycleLapsKey = false;
    this._prevCycleDifficultyKey = false;
    this._prevCycleBotCountKey = false;

    this._cameraCurrentPos = new THREE.Vector3();
    this._cameraCurrentLookAt = new THREE.Vector3();
    this._cameraInitialized = false;

    this._loadTrack(0);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x33422f, 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-40, 60, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 150;
    this.scene.add(sun);
  }

  // Saca la pista anterior (si habia) y arma la nueva a partir de su
  // entrada en tracks.json: genera los puntos de control con el mismo
  // generador seed-eable que usan las 15 pistas (ver data/tracks/
  // generateLoop.js), arma el Track, pinta el cielo/niebla segun su
  // ambiente, y ubica el auto en la nueva largada (lo crea la primera
  // vez, lo teletransporta las siguientes).
  _loadTrack(index) {
    const trackData = TRACKS[index];
    const environment = getEnvironment(trackData.environment);

    if (this.track) {
      this.scene.remove(this.track.mesh);
      this.track.dispose(this.physicsWorld);
    }

    const points = generateLoopPoints(trackData.generator);
    this.track = new Track(
      this.physicsWorld,
      { width: trackData.width, points, surfaceZones: trackData.surfaceZones },
      environment
    );
    this.scene.add(this.track.mesh);

    this.scene.background = new THREE.Color(environment.sky);
    this.scene.fog = new THREE.Fog(environment.fog, environment.fogNear, environment.fogFar);

    const start = this.track.getStartTransform();
    if (!this.car) {
      this.car = new Car(this.physicsWorld, { position: start.position, heading: start.heading });
      this.scene.add(this.car.mesh);
    } else {
      this.car.teleportTo(start.position, start.heading);
    }

    this._currentTrackIndex = index;
    this._currentTrackData = trackData;
    this._lapsTarget = trackData.recommendedLaps;
    this._difficulty = getDifficulty(trackData.difficulty) || DEFAULT_DIFFICULTY;
    this._currentLap = 1;
    this._raceFinished = false;
    this._prevT = null; // evita que el primer frame en la largada cuente como vuelta

    this._respawnBots();
  }

  // Fase 5: saca los bots anteriores (si habia) y crea `botCount` autos
  // nuevos en la grilla de largada (Track.getGridStartTransform), cada uno
  // con su propio AIDriver. Se llama al cargar una pista nueva y al ciclar
  // la cantidad de bots con B.
  _respawnBots() {
    this._botCars.forEach((botCar) => {
      this.scene.remove(botCar.mesh);
      botCar.dispose(this.physicsWorld);
    });
    this._botCars = [];
    this._botDrivers = [];

    const botCount = BOT_COUNT_OPTIONS[this._botCountIndex];
    const speedMultiplier = this._difficulty.aiSpeedMultiplier;

    for (let slot = 0; slot < botCount; slot++) {
      const { position, heading } = this.track.getGridStartTransform(slot);
      const botCar = new Car(this.physicsWorld, { position, heading, color: BOT_COLORS[slot % BOT_COLORS.length] });
      this.scene.add(botCar.mesh);
      this._botCars.push(botCar);
      this._botDrivers.push(new AIDriver({ speedMultiplier }));
    }
  }

  update(dt, inputState) {
    this._handleDebugTrackControls(inputState);

    // superficie bajo el auto ahora mismo (posicion sincronizada el frame
    // pasado) -- Fase 3: escala velocidad/aceleracion/giro/agarre
    const surfaceKey = this.track.getSurfaceTypeAt(this.car.position.x, this.car.position.z);
    this.car.applyInput(dt, inputState, surfaceKey);

    this._botCars.forEach((botCar, i) => {
      const botSurfaceKey = this.track.getSurfaceTypeAt(botCar.position.x, botCar.position.z);
      const aiInput = this._botDrivers[i].computeInput(botCar, this.track);
      botCar.applyInput(dt, aiInput, botSurfaceKey);
    });

    const allCars = [this.car, ...this._botCars];
    this.physicsWorld.step(dt, (fixedDt) => {
      allCars.forEach((c) => c.vehicle.updatePhysics(fixedDt));
    });
    allCars.forEach((c) => {
      c.vehicle.postPhysicsStep();
      c.syncMeshFromPhysics();
    });

    this._updateLapCounter();
  }

  // Debug (Fase 4, sin menu todavia -- eso es Fase 8): N cambia de pista,
  // L cicla la cantidad de vueltas de la carrera actual, K cicla la
  // dificultad. InputManager solo reporta estado "apretada/no apretada",
  // asi que cada uno necesita su propia deteccion de flanco (front-edge)
  // para no repetir la accion mientras la tecla queda sostenida -- mismo
  // patron que el toggle de transferencia de peso en VehicleController.
  _handleDebugTrackControls(input) {
    if (input.nextTrack && !this._prevNextTrackKey) {
      this._loadTrack((this._currentTrackIndex + 1) % TRACKS.length);
    }
    this._prevNextTrackKey = input.nextTrack;

    if (input.cycleLaps && !this._prevCycleLapsKey) {
      const idx = LAP_OPTIONS.indexOf(this._lapsTarget);
      this._lapsTarget = LAP_OPTIONS[(idx + 1) % LAP_OPTIONS.length] ?? LAP_OPTIONS[0];
      this._currentLap = 1;
      this._raceFinished = false;
    }
    this._prevCycleLapsKey = input.cycleLaps;

    if (input.cycleDifficulty && !this._prevCycleDifficultyKey) {
      const idx = DIFFICULTY_LEVELS.findIndex((d) => d.id === this._difficulty.id);
      this._difficulty = DIFFICULTY_LEVELS[(idx + 1) % DIFFICULTY_LEVELS.length];
      // no hace falta respawnear los bots por esto -- solo actualizarles
      // el multiplicador para no perder su posicion/progreso en la vuelta
      this._botDrivers.forEach((driver) => {
        driver.speedMultiplier = this._difficulty.aiSpeedMultiplier;
      });
    }
    this._prevCycleDifficultyKey = input.cycleDifficulty;

    if (input.cycleBotCount && !this._prevCycleBotCountKey) {
      this._botCountIndex = (this._botCountIndex + 1) % BOT_COUNT_OPTIONS.length;
      this._respawnBots();
    }
    this._prevCycleBotCountKey = input.cycleBotCount;
  }

  // t (0..1, posicion a lo largo de la curva) viene de Track.getTrackInfo
  // y cruza de ~1 a ~0 cada vez que se pasa por la largada -- eso es lo
  // que cuenta una vuelta. Se exige que el frame anterior estuviera bien
  // arriba (cerca de 1) y el actual bien abajo (cerca de 0) para no
  // contar vueltas de mas por jitter en el punto medio del trazado.
  _updateLapCounter() {
    const { t } = this.track.getTrackInfo(this.car.position.x, this.car.position.z);

    if (this._prevT !== null && !this._raceFinished) {
      if (this._prevT > LAP_CROSS_HIGH_T && t < LAP_CROSS_LOW_T) {
        this._currentLap++;
        if (this._currentLap > this._lapsTarget) {
          this._currentLap = this._lapsTarget;
          this._raceFinished = true;
        }
      }
    }

    this._prevT = t;
  }

  // Para el HUD de debug (Engine._updateDebugHud) -- todavia no hay UI de
  // carrera real, eso es Fase 8.
  getRaceInfo() {
    return {
      trackName: this._currentTrackData.name,
      inspiredBy: this._currentTrackData.inspiredBy,
      environmentKey: this._currentTrackData.environment,
      lap: this._currentLap,
      lapsTarget: this._lapsTarget,
      difficultyLabel: this._difficulty.label,
      raceFinished: this._raceFinished,
      botCount: this._botCars.length
    };
  }

  updateCamera(camera, dt) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.mesh.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    else forward.set(0, 0, 1);

    // la camara siempre queda detras del auto, a la altura/distancia de CAMERA_OFFSET
    const behindDistance = Math.abs(CAMERA_OFFSET.z);
    const desiredPos = new THREE.Vector3(
      this.car.position.x - forward.x * behindDistance,
      this.car.position.y + CAMERA_OFFSET.y,
      this.car.position.z - forward.z * behindDistance
    );

    const desiredLookAt = this.car.position.clone().add(forward.multiplyScalar(CAMERA_LOOK_AHEAD));

    if (!this._cameraInitialized) {
      this._cameraCurrentPos.copy(desiredPos);
      this._cameraCurrentLookAt.copy(desiredLookAt);
      this._cameraInitialized = true;
    } else {
      const t = 1 - Math.exp(-CAMERA_LERP * dt);
      this._cameraCurrentPos.lerp(desiredPos, t);
      this._cameraCurrentLookAt.lerp(desiredLookAt, t);
    }

    camera.position.copy(this._cameraCurrentPos);
    camera.lookAt(this._cameraCurrentLookAt);
  }
}
