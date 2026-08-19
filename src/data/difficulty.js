// Niveles de dificultad seleccionables por carrera (Fase 4: "distintas
// modalidades por pista: cantidad de vueltas configurable y niveles de
// dificultad"). Cada pista tiene un `difficulty` sugerido en tracks.json,
// pero cualquier pista se puede jugar en cualquiera de estos niveles.
//
// aiSpeedMultiplier / coinMultiplier quedan definidos aca porque el brief
// original dice que la dificultad "afecta el nivel de la IA rival y el
// multiplicador de monedas". aiSpeedMultiplier ya lo usa AIDriver (Fase 5)
// para decidir que tan tarde frena un bot antes de una curva -- mas alto,
// mas agresivo. coinMultiplier sigue sin uso: las monedas son la Fase 6.

export const DIFFICULTY_LEVELS = [
  { id: 'easy', label: 'Fácil', aiSpeedMultiplier: 0.85, coinMultiplier: 1 },
  { id: 'medium', label: 'Media', aiSpeedMultiplier: 1.0, coinMultiplier: 1.5 },
  { id: 'hard', label: 'Difícil', aiSpeedMultiplier: 1.15, coinMultiplier: 2 }
];

export const DEFAULT_DIFFICULTY = DIFFICULTY_LEVELS[1]; // 'medium'

export const LAP_OPTIONS = [5, 10, 15];

export function getDifficulty(id) {
  return DIFFICULTY_LEVELS.find((d) => d.id === id) || DEFAULT_DIFFICULTY;
}
