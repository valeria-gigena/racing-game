import { defineConfig } from 'vite';

// base relativa ('./') solo para el build de produccion: asi el build
// funciona sirviendolo desde cualquier subruta (GitHub Pages en
// /racing-game/, un preview local en la raiz, etc.) sin tener que fijar
// una ruta especifica -- una ruta absoluta como '/racing-game/' solo
// funciona si el server que lo sirve usa exactamente esa subruta (rompe,
// por ejemplo, sirviendo dist/ como raiz con Go Live). En dev queda '/'
// para no romper el servidor local.
export default defineConfig(({ command }) => ({
  root: '.',
  publicDir: 'public',
  base: command === 'build' ? './' : '/',
  server: {
    port: Number(process.env.PORT) || 5173
  }
}));
