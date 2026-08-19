// Multiplicadores por tipo de superficie. Se aplican sobre las
// constantes base del manejo (MK_MAX_SPEED, MK_ACCEL, MK_TURN_RATE_MAX
// en VehicleController) y sobre el agarre de los neumaticos durante el
// derrape -- el resto de la fisica no cambia.
//
// Las pistas de la Fase 4 usan asphalt/grass/gravel/sand/ice segun el
// ambiente de cada una (ver src/data/environments.js).

export const SURFACE_TYPES = {
  asphalt: {
    maxSpeedMultiplier: 1.0,
    accelMultiplier: 1.0,
    gripMultiplier: 1.0,
    turnRateMultiplier: 1.0
  },
  grass: {
    maxSpeedMultiplier: 0.7,
    accelMultiplier: 0.6,
    gripMultiplier: 0.55,
    turnRateMultiplier: 0.75
  },
  gravel: {
    maxSpeedMultiplier: 0.6,
    accelMultiplier: 0.5,
    gripMultiplier: 0.45,
    turnRateMultiplier: 0.65
  },
  sand: {
    maxSpeedMultiplier: 0.45,
    accelMultiplier: 0.35,
    gripMultiplier: 0.3,
    turnRateMultiplier: 0.5
  },
  // el hielo no frena tanto en linea recta como la arena -- lo que le
  // falta es agarre: cuesta acelerar sin patinar y dobla mal (para las
  // pistas de nieve)
  ice: {
    maxSpeedMultiplier: 0.85,
    accelMultiplier: 0.4,
    gripMultiplier: 0.25,
    turnRateMultiplier: 0.6
  }
};

export const DEFAULT_SURFACE = SURFACE_TYPES.asphalt;

export function getSurface(key) {
  return SURFACE_TYPES[key] || DEFAULT_SURFACE;
}
