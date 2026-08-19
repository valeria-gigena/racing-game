// Teclado unificado. El soporte de Gamepad API se agrega en la Fase 10
// exponiendo el mismo shape de estado, para que Car/AIDriver no tengan
// que distinguir el origen del input.

const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  drift: ['ShiftLeft', 'ShiftRight'],
  toggleWeightTransfer: ['KeyP'], // debug: activa/desactiva la fisica de transferencia de peso
  // debug (Fase 4): todavia no hay menu (eso es Fase 8) para elegir
  // pista/vueltas/dificultad, asi que por ahora se ciclan con teclado
  nextTrack: ['KeyN'],
  cycleLaps: ['KeyL'],
  cycleDifficulty: ['KeyK'],
  toggleFreeCamera: ['KeyC'], // debug: camara libre (OrbitControls) para inspeccionar la pista desde cualquier angulo
  cycleBotCount: ['KeyB'] // debug (Fase 5): cicla cuantos bots de IA hay en pista (0/3/6/9)
};

export class InputManager {
  constructor() {
    this.state = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
      drift: false,
      toggleWeightTransfer: false,
      nextTrack: false,
      cycleLaps: false,
      cycleDifficulty: false,
      toggleFreeCamera: false,
      cycleBotCount: false
    };

    this._keysDown = new Set();

    this._onKeyDown = (e) => {
      this._keysDown.add(e.code);
      this._syncState();
    };
    this._onKeyUp = (e) => {
      this._keysDown.delete(e.code);
      this._syncState();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _syncState() {
    for (const action in KEY_BINDINGS) {
      this.state[action] = KEY_BINDINGS[action].some((code) => this._keysDown.has(code));
    }
  }

  getState() {
    return this.state;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
