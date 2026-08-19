// Feedback minimo del derrape/turbo (barra de carga + flash de "TURBO").
// Placeholder funcional: en la Fase 8 esto se reemplaza por el HUD real
// (con sprites/efectos en vez de divs), pero la logica de que mostrar
// cuando ya la resuelve VehicleController.getDriftState().

export class DriftMeter {
  constructor() {
    this.pips = Array.from(document.querySelectorAll('.drift-pip'));
    this.turboFlash = document.getElementById('turbo-flash');
  }

  update(driftState) {
    if (!driftState) return;

    this.pips.forEach((pip, index) => {
      const tier = index + 1;
      pip.classList.toggle(`tier-${tier}`, driftState.chargeTier >= tier);
    });

    this.turboFlash.classList.toggle('show', driftState.isBoosting);
  }
}
