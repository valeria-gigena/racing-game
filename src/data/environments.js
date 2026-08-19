// Ambiente visual + de superficie de cada pista: colores de cielo/niebla/
// piso y que superficie (ver physics/SurfaceTypes.js) se usa fuera del
// asfalto. Los circuitos "reales" comparten un puñado de ambientes
// mundanos (dia/atardecer/nublado); los ficticios tienen cada uno el
// suyo bien distinto, a pedido: "que cambie el ambiente, ej. una carrera
// en el espacio y otra en la playa".
//
// Colores en formato hex numerico (los que usa THREE.Color directo).
// Placeholder: son colores planos, no texturas -- eso es Fase 11.

export const ENVIRONMENTS = {
  classic_day: {
    sky: 0x87ceeb,
    fog: 0x87ceeb,
    fogNear: 90,
    fogFar: 220,
    ground: 0x2f5d34,
    asphalt: 0x3a3a3f,
    offTrackSurface: 'grass'
  },
  classic_dusk: {
    sky: 0xf0a868,
    fog: 0xd98a5f,
    fogNear: 80,
    fogFar: 200,
    ground: 0x355e35,
    asphalt: 0x3a3a3f,
    offTrackSurface: 'grass'
  },
  classic_overcast: {
    sky: 0xb9c2c9,
    fog: 0xaab3ba,
    fogNear: 70,
    fogFar: 190,
    ground: 0x3a5c3a,
    asphalt: 0x3f3f42,
    offTrackSurface: 'grass'
  },
  urban_dusk: {
    sky: 0xc97b63,
    fog: 0x8a5f6b,
    fogNear: 70,
    fogFar: 180,
    ground: 0x55565c, // vereda/cordon en vez de pasto
    asphalt: 0x2c2c30,
    offTrackSurface: 'gravel'
  },
  forest_day: {
    sky: 0x9fd0e8,
    fog: 0x7fae7f,
    fogNear: 70,
    fogFar: 190,
    ground: 0x2b4a2b,
    asphalt: 0x3a3a3f,
    offTrackSurface: 'grass'
  },
  space: {
    sky: 0x05030f,
    fog: 0x0a0820,
    fogNear: 110,
    fogFar: 260,
    ground: 0x1c1c26,
    asphalt: 0x2e2e55,
    offTrackSurface: 'gravel'
  },
  beach: {
    sky: 0x8fd8ff,
    fog: 0xbfe9ff,
    fogNear: 90,
    fogFar: 230,
    ground: 0xe8d29a,
    asphalt: 0x4a4a4a,
    offTrackSurface: 'sand'
  },
  moon: {
    sky: 0x0b0b12,
    fog: 0x1a1a24,
    fogNear: 110,
    fogFar: 260,
    ground: 0x8f8f8f,
    asphalt: 0x5a5a5a,
    offTrackSurface: 'gravel'
  },
  jungle: {
    sky: 0xbfe6c8,
    fog: 0x6fae6f,
    fogNear: 60,
    fogFar: 170,
    ground: 0x1f4a24,
    asphalt: 0x403a2e,
    offTrackSurface: 'grass'
  },
  snow: {
    sky: 0xd9ecf5,
    fog: 0xeaf4fa,
    fogNear: 80,
    fogFar: 210,
    ground: 0xf2f6fa,
    asphalt: 0x4d5560,
    offTrackSurface: 'ice'
  },
  desert: {
    sky: 0xf2c98a,
    fog: 0xe8b878,
    fogNear: 90,
    fogFar: 220,
    ground: 0xd9b06a,
    asphalt: 0x5a4d3a,
    offTrackSurface: 'sand'
  },
  neon_city: {
    sky: 0x150a2e,
    fog: 0x2a1550,
    fogNear: 80,
    fogFar: 210,
    ground: 0x17171f,
    asphalt: 0x221a33,
    offTrackSurface: 'gravel'
  },
  volcano: {
    sky: 0x3a1210,
    fog: 0x5a1f18,
    fogNear: 70,
    fogFar: 190,
    ground: 0x241414,
    asphalt: 0x2e2020,
    offTrackSurface: 'gravel'
  },
  reef: {
    sky: 0x4fc3d6,
    fog: 0x7fd6df,
    fogNear: 85,
    fogFar: 210,
    ground: 0xd8c98a,
    asphalt: 0x3f5a5a,
    offTrackSurface: 'sand'
  }
};

export function getEnvironment(key) {
  return ENVIRONMENTS[key] || ENVIRONMENTS.classic_day;
}
