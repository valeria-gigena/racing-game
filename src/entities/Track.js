import * as THREE from 'three';

// Pista generica a partir de una lista de puntos de control (waypoints):
// arma un lazo cerrado suave con Catmull-Rom y extruye una cinta de
// asfalto de ancho constante a lo largo de la curva. Reemplaza al valo
// "stadium" fijo de las Fases 1-3 (ese era un caso particular de esto).
//
// La superficie en un punto (x,z) se calcula geometricamente: se busca
// el punto muestreado de la curva mas cercano, y su distancia da si esta
// dentro del ancho de la pista (asfalto, o lo que diga surfaceZones para
// tramos mixtos) o afuera (la superficie de "afuera de pista" del
// ambiente). El mismo parametro `t` (posicion a lo largo de la curva,
// 0..1) que da esa busqueda sirve tambien para contar vueltas -- ver
// SceneManager.

const SAMPLE_COUNT = 200; // resolucion de la curva para dibujar y para las busquedas de superficie/vuelta
const GROUND_MARGIN = 90; // cuanto pasto/entorno queda alrededor del trazado
const GRID_ROW_SPACING = 5; // metros entre filas de largada de los bots (Fase 5)

export class Track {
  constructor(physicsWorld, trackData, environment) {
    this.width = trackData.width;
    this.environment = environment;
    this.surfaceZones = trackData.surfaceZones || null;

    const controlPoints = trackData.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);
    this._curveLength = this.curve.getLength(); // Fase 5: para convertir metros a delta-t en getPointAhead

    this._frames = this._buildFrames();
    this._groundSize = this._computeGroundSize(controlPoints);

    this.mesh = new THREE.Group();
    this.mesh.add(this._buildGround());
    this.mesh.add(this._buildAsphalt());
    this.mesh.add(this._buildStartLine());
    this.mesh.add(...this._buildMarkers());

    this._buildGroundCollider(physicsWorld);
  }

  // Un punto + tangente + normal-lateral por cada muestra de la curva.
  // Se calcula una sola vez en el constructor y se reusa para dibujar la
  // cinta de asfalto, los postes, la linea de largada, y para las
  // busquedas de superficie/vuelta en cada frame.
  _buildFrames() {
    // getSpacedPoints(n) en una curva CERRADA devuelve n+1 puntos donde
    // el primero y el ultimo son el mismo punto (distancia 0) -- sin el
    // slice, ese duplicado queda como un segmento de largo cero en el
    // cierre del lazo (justo en la linea de largada), y si sus vectores
    // "right" no coinciden exactamente crea un quad degenerado/plegado
    // ahi mismo, visible como un pliegue del asfalto pegado al auto en
    // el spawn.
    const points = this.curve.getSpacedPoints(SAMPLE_COUNT).slice(0, -1);
    const frames = [];
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      const tangent = new THREE.Vector3().subVectors(next, prev);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      tangent.normalize();
      const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
      frames.push({ point: points[i], tangent, right });
    }

    return frames;
  }

  _computeGroundSize(controlPoints) {
    let maxExtent = 0;
    for (const p of controlPoints) {
      maxExtent = Math.max(maxExtent, Math.abs(p.x), Math.abs(p.z));
    }
    return (maxExtent + GROUND_MARGIN) * 2;
  }

  _buildGroundCollider(physicsWorld) {
    const RAPIER = physicsWorld.RAPIER;
    const world = physicsWorld.world;
    const halfHeight = 0.5;

    this._groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -halfHeight, 0));
    const colliderDesc = RAPIER.ColliderDesc.cuboid(this._groundSize / 2, halfHeight, this._groundSize / 2).setFriction(
      1
    );
    world.createCollider(colliderDesc, this._groundBody);
  }

  _buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this._groundSize, this._groundSize),
      new THREE.MeshStandardMaterial({ color: this.environment.ground, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  _buildAsphalt() {
    const n = this._frames.length;
    const positions = new Float32Array(n * 2 * 3);

    this._frames.forEach(({ point, right }, i) => {
      const left = point.clone().addScaledVector(right, -this.width / 2);
      const edge = point.clone().addScaledVector(right, this.width / 2);
      positions.set([left.x, 0.08, left.z, edge.x, 0.08, edge.z], i * 6);
    });

    // El culling de caras traseras (activado por defecto) descartaba TODA
    // la cinta de asfalto sin importar el trazado: con el orden (a,b,c),
    // (b,d,c) el producto cruz (v1-v0)x(v2-v0) da cross(right, tangent) =
    // (0,-1,0) -- la normal quedaba mirando hacia ABAJO, invisible desde
    // cualquier camara normal (y desde la camara libre en cenital,
    // tambien -- se ve el pasto A TRAVES del asfalto, no arriba de el).
    // Confirmado leyendo pixeles reales del canvas via proyeccion de
    // puntos del centro de la pista a coordenadas de pantalla: el color
    // muestreado en el centro de la pista era el del pasto en (casi) toda
    // la pista, no el del asfalto -- asi en las 15 pistas, porque el
    // orden de los indices es el mismo en todas. El polygonOffset y el
    // gap en Y de mas arriba (que ya estaban puestos por un intento previo
    // de arreglar esto como si fuera z-fighting) no tenian nada que
    // arreglar: una cara culleada no llega ni a la prueba de profundidad.
    // El arreglo real es invertir el orden de cada triangulo.
    const indices = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % n) * 2;
      const d = ((i + 1) % n) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const asphalt = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: this.environment.asphalt,
        roughness: 0.9,
        // El offset en Y entre asfalto y pasto (0.08, antes 0.01) mas este
        // polygonOffset son cinturon y tiradores contra el mismo problema:
        // confirmado muestreando pixeles reales del canvas con near=0.1 y
        // solo polygonOffset, el pasto le ganaba el z-test al asfalto en
        // casi toda la pista (el centro de la pista renderizaba verde).
        // La causa real era el near plane de la camara -- ver Engine.js --
        // pero se deja ademas un offset generoso ac y un gap real en Y
        // (no solo el offset de profundidad, que no mueve la posicion
        // real) para no volver a depender de un solo mecanismo.
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8
      })
    );
    asphalt.receiveShadow = true;
    return asphalt;
  }

  _buildStartLine() {
    const { point, right } = this._frames[0];
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        // mismo motivo que el polygonOffset del asfalto -- esta franja
        // esta todavia mas cerca del asfalto (0.02 de diferencia en Y)
        polygonOffset: true,
        polygonOffsetFactor: -12,
        polygonOffsetUnits: -12
      })
    );
    line.rotation.x = -Math.PI / 2;
    const angle = Math.atan2(right.x, right.z);
    line.rotation.z = -angle; // alinea la franja con el ancho de la pista en ese punto
    line.position.set(point.x, 0.1, point.z);
    return line;
  }

  _buildMarkers() {
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xdddd22 });
    const markers = [];
    const markerEvery = Math.floor(this._frames.length / 24); // ~24 postes por vuelta, cualquiera sea el largo

    for (let i = 0; i < this._frames.length; i += markerEvery) {
      const { point, right } = this._frames[i];
      const offset = this.width / 2 + 2;
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), markerMaterial);
      marker.position.set(point.x + right.x * offset, 0.6, point.z + right.z * offset);
      markers.push(marker);
    }

    return markers;
  }

  getStartTransform() {
    const { point, tangent } = this._frames[0];
    return {
      position: point.clone(),
      heading: Math.atan2(tangent.x, tangent.z)
    };
  }

  // Fase 5: posicion de largada en grilla para el bot en `slot` (0, 1, 2...
  // hasta 8 para 9 bots), detras de la linea de largada -- a diferencia de
  // getStartTransform() (que es exactamente el punto de la linea, para el
  // jugador), estas quedan escalonadas en filas de a dos autos para no
  // spawnear todas superpuestas entre si ni con el jugador.
  getGridStartTransform(slot) {
    const { point, tangent, right } = this._frames[0];
    const col = slot % 2 === 0 ? -1 : 1;
    const row = Math.floor(slot / 2) + 1; // +1: nunca sobre la linea de largada
    const gridPoint = point
      .clone()
      .addScaledVector(right, col * (this.width / 4))
      .addScaledVector(tangent, -row * GRID_ROW_SPACING);
    return {
      position: gridPoint,
      heading: Math.atan2(tangent.x, tangent.z)
    };
  }

  // Fase 5: punto + tangente sobre la curva a `distanceMeters` adelante de
  // `t` (0..1, mismo parametro que getTrackInfo). Usa curve.getPointAt/
  // getTangentAt de Three.js, que ya hacen la reparametrizacion por largo
  // de arco (misma tabla que usa getSpacedPoints) -- convertir metros a
  // delta-t es una simple division por el largo total de la curva. Lo usa
  // AIDriver para "mirar" un poco adelante sobre la pista: un punto cerca
  // para saber hacia donde doblar, y uno mas lejos para anticipar curvas
  // cerradas y frenar antes.
  getPointAhead(t, distanceMeters) {
    const deltaT = distanceMeters / this._curveLength;
    const targetT = (((t + deltaT) % 1) + 1) % 1;
    const tangent = this.curve.getTangentAt(targetT);
    return {
      point: this.curve.getPointAt(targetT),
      tangent,
      right: new THREE.Vector3(tangent.z, 0, -tangent.x) // misma convencion que _buildFrames
    };
  }

  // Busca el punto muestreado mas cercano a (x,z). O(SAMPLE_COUNT) por
  // llamada (una vez por frame): de sobra para 200 muestras a 60fps.
  getTrackInfo(x, z) {
    let bestDistSq = Infinity;
    let bestIndex = 0;

    for (let i = 0; i < this._frames.length; i++) {
      const p = this._frames[i].point;
      const dx = x - p.x;
      const dz = z - p.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }

    const t = bestIndex / this._frames.length;
    const distance = Math.sqrt(bestDistSq);
    const onTrack = distance <= this.width / 2;
    const surfaceKey = onTrack ? this._surfaceZoneAt(t) : this.environment.offTrackSurface;

    return { t, distance, onTrack, surfaceKey };
  }

  getSurfaceTypeAt(x, z) {
    return this.getTrackInfo(x, z).surfaceKey;
  }

  _surfaceZoneAt(t) {
    if (this.surfaceZones) {
      for (const zone of this.surfaceZones) {
        const inZone = zone.from <= zone.to ? t >= zone.from && t <= zone.to : t >= zone.from || t <= zone.to;
        if (inZone) return zone.surface;
      }
    }
    return 'asphalt';
  }

  // Saca el collider de piso de esta pista del mundo de fisica. Se llama
  // al cambiar de pista (tecla de debug N) para no dejar colliders viejos
  // superpuestos con la pista nueva.
  dispose(physicsWorld) {
    physicsWorld.world.removeRigidBody(this._groundBody);
  }
}
