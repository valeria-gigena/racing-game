// Genera los puntos de control de un trazado cerrado: un ovalo con
// "ruido" de radio reproducible (mismo seed = siempre el mismo trazado).
// No reemplaza el diseño de circuitos reales, pero da 15 siluetas
// distintas sin tener que dibujar cada punto a mano -- cada pista ajusta
// numPoints/radios/variation/seed para que su "personalidad" (ovalada y
// rapida, o angosta y tecnica) combine con su nombre/ambiente.

// Cuantas pasadas de suavizado (promedio circular de 3 puntos) se le
// aplican al ruido de radio antes de usarlo. Sin esto, el ruido de cada
// punto es independiente del de sus vecinos: con suficiente `variation`
// y `numPoints`, eso da curvas mas cerradas que la mitad del ancho de la
// pista, y la cinta de asfalto (Track._buildAsphalt) se pliega sobre si
// misma en esos tramos -- se ve como si el asfalto desapareciera y
// asomara el terreno de abajo. 5 pasadas fue el minimo que, probado
// contra las 15 pistas de tracks.json (incluida Monaco, la mas angosta y
// con mas variacion), deja el radio de curvatura minimo con margen sobre
// la mitad del ancho en todos los casos -- ver PROGRESS.md.
const NOISE_SMOOTH_PASSES = 5;

function mulberry32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothNoise(noises) {
  const n = noises.length;
  let current = noises;
  for (let pass = 0; pass < NOISE_SMOOTH_PASSES; pass++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = current[(i - 1 + n) % n];
      const cur = current[i];
      const nxt = current[(i + 1) % n];
      next[i] = (prev + cur * 2 + nxt) / 4;
    }
    current = next;
  }
  return current;
}

export function generateLoopPoints({ numPoints, radiusX, radiusZ, variation = 0, seed = 1 }) {
  const rand = mulberry32(seed);
  const rawNoise = [];

  for (let i = 0; i < numPoints; i++) {
    rawNoise.push(1 + (rand() * 2 - 1) * variation);
  }

  const noise = smoothNoise(rawNoise);
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    points.push([Math.cos(angle) * radiusX * noise[i], Math.sin(angle) * radiusZ * noise[i]]);
  }

  return points;
}
