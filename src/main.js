import { Engine } from './core/Engine.js';

async function main() {
  const container = document.getElementById('app');
  const engine = new Engine(container);
  await engine.init();
  engine.start();
}

main();
