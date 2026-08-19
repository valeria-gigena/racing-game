import RAPIER from '@dimforge/rapier3d-compat';

// Rapier necesita un timestep fijo para ser estable (no le podemos pasar
// el dt variable del requestAnimationFrame directamente). Por eso se usa
// un acumulador clasico: cada frame se acumula el tiempo real transcurrido
// y se avanza la simulacion en pasos fijos de FIXED_TIMESTEP.
export const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS_PER_FRAME = 5; // evita la "espiral de la muerte" si un frame tarda demasiado

export class PhysicsWorld {
  static async create() {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_TIMESTEP;
    this._accumulator = 0;
  }

  /**
   * Avanza la simulacion. `beforeSubstep` se llama antes de cada paso fijo
   * (ahi es donde los VehicleController deben llamar a su updateVehicle,
   * para que quede sincronizado con el mismo dt que usa world.step()).
   */
  step(dt, beforeSubstep) {
    this._accumulator += dt;
    let substeps = 0;

    while (this._accumulator >= FIXED_TIMESTEP && substeps < MAX_SUBSTEPS_PER_FRAME) {
      if (beforeSubstep) beforeSubstep(FIXED_TIMESTEP);
      this.world.step();
      this._accumulator -= FIXED_TIMESTEP;
      substeps++;
    }
  }
}
