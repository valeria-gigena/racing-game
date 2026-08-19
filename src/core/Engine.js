import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InputManager } from './InputManager.js';
import { SceneManager } from './SceneManager.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { DriftMeter } from '../ui/DriftMeter.js';

// Dueño del renderer/camara/reloj y del loop principal. No conoce
// contenido de juego (eso vive en SceneManager) para poder reusarse
// igual cuando en fases futuras haya multiples viewports (split-screen).
//
// La construccion se separa en constructor() + init() porque cargar el
// modulo WASM de Rapier es asincrono (RAPIER.init()), y SceneManager ya
// necesita el mundo de fisica listo para crear el auto y la pista.

export class Engine {
  constructor(container) {
    this.container = container;

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();

    // near=0.1 con far=500 (rango 1:5000) deja muy poca precision de
    // z-buffer a las distancias normales de la camara de persecucion
    // (10-60 unidades) -- ahi es donde el asfalto (apenas mas alto que
    // el pasto) perdia el z-test contra el suelo, aunque el polygonOffset
    // de Track._buildAsphalt en teoria lo compensara (confirmado
    // muestreando pixeles reales del canvas: el centro de la pista
    // renderizaba del color del pasto en casi toda la pista). Subir el
    // near plane a 1 (de sobra: la camara nunca esta a menos de eso del
    // auto) reduce el rango a 1:500 y le devuelve la precision que
    // necesita el z-test para resolver bien esa diferencia de 0.01-0.08.
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.input = new InputManager();
    this.driftMeter = new DriftMeter();

    // Camara libre de debug (tecla C): OrbitControls sobre la misma
    // camara del juego, para poder mirar la pista desde cualquier angulo
    // (arrastrar = rotar, rueda = zoom, click derecho + arrastrar = pan)
    // en vez de depender de la camara en tercera persona. Arranca
    // deshabilitada para no interferir con el manejo normal.
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enabled = false;
    this._freeCameraOn = false;
    this._prevFreeCameraKey = false;

    // el sufijo de "transferencia de peso" es feedback minimo para la
    // tecla de debug P (ver VehicleController) -- placeholder de texto
    // hasta que exista un HUD real en la Fase 8
    this._debugHud = document.getElementById('debug-hud');
    this._debugHudBaseText = this._debugHud.textContent;

    // segunda linea de debug (Fase 4): pista/vuelta/dificultad actuales y
    // como cambiarlas -- placeholder de texto hasta el HUD real (Fase 8)
    this._raceHud = document.getElementById('race-hud');

    window.addEventListener('resize', () => this._onResize());
  }

  async init() {
    this.physicsWorld = await PhysicsWorld.create();
    this.sceneManager = new SceneManager(this.scene, this.physicsWorld);
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1); // clamp para evitar saltos si la pestaña pierde foco

    const inputState = this.input.getState();
    this.sceneManager.update(dt, inputState);

    this._handleFreeCameraToggle(inputState);
    if (this._freeCameraOn) {
      this.orbitControls.update();
    } else {
      this.sceneManager.updateCamera(this.camera, dt);
    }

    this.driftMeter.update(this.sceneManager.car.getDriftState());
    this._updateDebugHud();
    this._updateRaceHud();

    this.renderer.render(this.scene, this.camera);
  }

  // Flanco de subida de C: prende/apaga la camara libre. Al prenderla,
  // arranca en vista aerea del centro de la pista (todas las pistas
  // quedan centradas en el origen del mundo -- ver generateLoopPoints)
  // para poder abarcar el trazado completo de entrada; desde ahi el
  // usuario arrastra/hace zoom con el mouse para inspeccionar cualquier
  // tramo. El auto sigue manejandose con WASD en el fondo aunque la
  // camara ya no lo siga.
  _handleFreeCameraToggle(input) {
    if (input.toggleFreeCamera && !this._prevFreeCameraKey) {
      this._freeCameraOn = !this._freeCameraOn;
      this.orbitControls.enabled = this._freeCameraOn;
      if (this._freeCameraOn) {
        this.camera.position.set(0, 140, 0.01);
        this.orbitControls.target.set(0, 0, 0);
        this.orbitControls.update();
      }
    }
    this._prevFreeCameraKey = input.toggleFreeCamera;
  }

  _updateDebugHud() {
    const weightTransferOn = this.sceneManager.car.isWeightTransferEnabled();
    this._debugHud.textContent =
      this._debugHudBaseText +
      (weightTransferOn ? '' : ' · Transferencia de peso: OFF (P para reactivar)') +
      (this._freeCameraOn ? ' · CÁMARA LIBRE (C para volver, arrastrar/rueda para mirar)' : '');
  }

  _updateRaceHud() {
    const race = this.sceneManager.getRaceInfo();
    const nameLine = race.inspiredBy ? `${race.trackName} (real: ${race.inspiredBy})` : race.trackName;
    const lapLine = race.raceFinished
      ? `Carrera terminada (${race.lapsTarget} vueltas)`
      : `Vuelta ${race.lap}/${race.lapsTarget}`;
    this._raceHud.textContent =
      `Pista: ${nameLine} · ${lapLine} · Dificultad: ${race.difficultyLabel} · Bots: ${race.botCount}` +
      ' · N: pista siguiente · L: vueltas · K: dificultad · B: bots';
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
