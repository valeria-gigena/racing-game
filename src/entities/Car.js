import * as THREE from 'three';
import { VehicleController, CHASSIS_HALF_EXTENTS } from '../physics/VehicleController.js';

// Placeholder geometrico. En la Fase 11 el mesh se reemplaza por un
// GLTFLoader apuntando a public/assets/models/cars/<id>.glb sin tocar
// la logica de esta clase.
//
// El movimiento ya no es cinematico (eso era la Fase 1): ahora delega
// todo a VehicleController, que mueve un chasis real de Rapier via
// raycast vehicle controller. Esta clase solo arma el mesh y sincroniza
// su transform con el rigid body cada frame.

export class Car {
  constructor(physicsWorld, { color = 0xd94b3a, position, heading = 0 } = {}) {
    this.mesh = this._buildPlaceholderMesh(color);
    this.vehicle = new VehicleController(physicsWorld, { position, heading });
  }

  _buildPlaceholderMesh(color) {
    const group = new THREE.Group();
    const { x: hx, y: hy, z: hz } = CHASSIS_HALF_EXTENTS;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })
    );
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 1.45, hy * 1.5, hz * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4 })
    );
    cabin.position.set(0, hy + hy * 0.75, -hz * 0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // franja frontal para distinguir a simple vista hacia donde "mira" el auto
    const frontMarker = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 1.8, 0.15, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    frontMarker.position.set(0, 0, hz);
    group.add(frontMarker);

    return group;
  }

  applyInput(dt, inputState, surfaceKey) {
    this.vehicle.applyInput(dt, inputState, surfaceKey);
  }

  syncMeshFromPhysics() {
    const { position, quaternion } = this.vehicle.getTransform();
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }

  get position() {
    return this.mesh.position;
  }

  // Yaw actual del auto (rad), misma convencion que el resto del proyecto
  // (atan2(tangente.x, tangente.z) en Track/VehicleController): usado por
  // AIDriver para saber hacia donde "mira" el auto y decidir si corregir
  // a izquierda o derecha.
  getHeading() {
    const q = this.mesh.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  }

  getSpeedKmh() {
    return this.vehicle.getSpeedKmh();
  }

  getDriftState() {
    return this.vehicle.getDriftState();
  }

  isWeightTransferEnabled() {
    return this.vehicle.isWeightTransferEnabled();
  }

  teleportTo(position, heading) {
    this.vehicle.teleportTo(position, heading);
    this.syncMeshFromPhysics();
  }

  dispose(physicsWorld) {
    this.vehicle.dispose(physicsWorld);
  }
}
