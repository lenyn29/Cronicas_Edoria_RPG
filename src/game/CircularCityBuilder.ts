import * as THREE from 'three';
import { TorchEntry } from './props3d';
import { getTerrainHeight, LANDMARKS } from './worldMath';

export interface CityCollider {
  x: number;
  z: number;
  r: number;
}

export interface CityGateSpec {
  id: 'N' | 'S' | 'E' | 'W';
  label: string;
  angle: number;
  x: number;
  z: number;
  outwardX: number;
  outwardZ: number;
}

export interface CityBuildingSpot {
  id: 'bank' | 'smith' | 'shop' | 'tavern' | 'elder' | 'barracks';
  name: string;
  angle: number;
  x: number;
  z: number;
  npcX: number;
  npcZ: number;
  faceX: number;
  faceZ: number;
}

export const CITY_RADIUS = 25;
export const CITY_SAFE_RADIUS = 30;
export const GUARD_ALERT_RADIUS = 35;

export function getCityGateSpecs(): CityGateSpec[] {
  const cx = LANDMARKS.village.x;
  const cz = LANDMARKS.village.z;
  return [
    {
      id: 'N',
      label: 'Llanura Norte',
      angle: -Math.PI * 0.5,
      x: cx,
      z: cz - CITY_RADIUS,
      outwardX: 0,
      outwardZ: -1,
    },
    {
      id: 'S',
      label: 'Llanura Sur',
      angle: Math.PI * 0.5,
      x: cx,
      z: cz + CITY_RADIUS,
      outwardX: 0,
      outwardZ: 1,
    },
    {
      id: 'E',
      label: 'Bosque Este',
      angle: 0,
      x: cx + CITY_RADIUS,
      z: cz,
      outwardX: 1,
      outwardZ: 0,
    },
    {
      id: 'W',
      label: 'Colinas Oeste',
      angle: Math.PI,
      x: cx - CITY_RADIUS,
      z: cz,
      outwardX: -1,
      outwardZ: 0,
    },
  ];
}

export function getCityBuildingSpots(): CityBuildingSpot[] {
  const cx = LANDMARKS.village.x;
  const cz = LANDMARKS.village.z;
  const specs: Array<{ id: CityBuildingSpot['id']; name: string; deg: number }> = [
    { id: 'bank', name: 'Banco de Piedrablanca', deg: -64 },
    { id: 'elder', name: 'Casa del Anciano', deg: -26 },
    { id: 'smith', name: 'Herrería de Lyra', deg: -154 },
    { id: 'barracks', name: 'Cuartel de la Guardia', deg: -116 },
    { id: 'tavern', name: 'Taberna del Dragón', deg: 135 },
    { id: 'shop', name: 'Bazar de Darío', deg: 45 },
  ];
  const buildR = 15.6;
  const npcR = 11.4;
  return specs.map((s) => {
    const rad = (s.deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      id: s.id,
      name: s.name,
      angle: rad,
      x: cx + cos * buildR,
      z: cz + sin * buildR,
      npcX: cx + cos * npcR,
      npcZ: cz + sin * npcR,
      faceX: cx + cos * (npcR - 4),
      faceZ: cz + sin * (npcR - 4),
    };
  });
}

export class CircularCityBuilder {
  public readonly group = new THREE.Group();
  public readonly colliders: CityCollider[] = [];

  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  private fountainJet: THREE.Mesh | null = null;
  private fountainSplashRing: THREE.Mesh | null = null;
  private fountainWaterMat: THREE.MeshLambertMaterial | null = null;

  private smokePoints: THREE.Points | null = null;
  private smokeGeo: THREE.BufferGeometry | null = null;
  private smokePositions: Float32Array | null = null;
  private smokeSeeds: Float32Array | null = null;
  private chimneyOrigin = new THREE.Vector3();

  private readonly tavernWindowMats: THREE.MeshLambertMaterial[] = [];

  constructor(
    seed: number,
    worldTorches: TorchEntry[],
    windowMaterials: THREE.MeshLambertMaterial[]
  ) {
    this.group.userData.sharedPropAssets = true;
    this.buildCity(seed, worldTorches, windowMaterials);
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private buildCity(
    seed: number,
    worldTorches: TorchEntry[],
    windowMaterials: THREE.MeshLambertMaterial[]
  ): void {
    const cx = LANDMARKS.village.x;
    const cz = LANDMARKS.village.z;
    const baseY = getTerrainHeight(cx, cz, seed);
    this.group.position.set(cx, baseY, cz);

    // 1. Central Plaza & Cardinal Avenues + Instanced Cobblestones (zero textures)
    this.buildPlazaAndCobblestones();

    // 2. Central Animated Water Fountain
    this.buildFountain();

    // 3. Circular Brick Wall & Crenellations (InstancedMesh) with 4 Gate Openings
    this.buildPerimeterWalls(cx, cz);

    // 4. 4 Arched Gateways (ShapeGeometry + ExtrudeGeometry) + Lanterns + Signposts
    this.buildCardinalGates(cx, cz, baseY, worldTorches);

    // 5. 6 Concentric Medieval Ring Buildings (Bank, Forge w/ Smoke, Shop w/ Awning, Tavern, Elder House, Barracks)
    this.buildDistrictBuildings(cx, cz, windowMaterials);

    // 6. Decorative Barrels, Crates & Flower Pots (InstancedMesh) + Plaza Lanterns
    this.buildUrbanProps(cx, cz, baseY, worldTorches);
  }

  private buildPlazaAndCobblestones(): void {
    const baseStoneMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x6f6c66 }));
    const roadStoneMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x7b756b }));

    // Plaza circular central (r = 8.4)
    const plazaGeo = this.trackGeo(new THREE.CylinderGeometry(8.5, 8.8, 0.08, 32));
    const plazaMesh = new THREE.Mesh(plazaGeo, baseStoneMat);
    plazaMesh.position.y = 0.015;
    plazaMesh.receiveShadow = true;
    this.group.add(plazaMesh);

    // Anillo decorativo dorado/ocre en la plaza
    const ringGeo = this.trackGeo(new THREE.RingGeometry(4.4, 4.95, 32));
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x9b8352 }));
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.06;
    ringMesh.receiveShadow = true;
    this.group.add(ringMesh);

    // 4 avenidas cardinales desde la plaza hasta la salida de cada portón
    const roadNS = this.trackGeo(new THREE.BoxGeometry(3.8, 0.06, CITY_RADIUS * 2 + 4));
    const roadEW = this.trackGeo(new THREE.BoxGeometry(CITY_RADIUS * 2 + 4, 0.06, 3.8));
    const mNS = new THREE.Mesh(roadNS, roadStoneMat);
    mNS.position.y = 0.01;
    mNS.receiveShadow = true;
    const mEW = new THREE.Mesh(roadEW, roadStoneMat);
    mEW.position.y = 0.012;
    mEW.receiveShadow = true;
    this.group.add(mNS, mEW);

    // Camino anular interior para conectar los 6 edificios (r = 12.2)
    const walkRingGeo = this.trackGeo(new THREE.RingGeometry(10.6, 13.4, 40));
    walkRingGeo.rotateX(-Math.PI / 2);
    const walkRing = new THREE.Mesh(walkRingGeo, roadStoneMat);
    walkRing.position.y = 0.014;
    walkRing.receiveShadow = true;
    this.group.add(walkRing);

    // Adoquines instanciados (1 solo draw call)
    const cobbleGeo = this.trackGeo(new THREE.BoxGeometry(0.74, 0.045, 0.56));
    const cobbleMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const positions: Array<{ x: number; z: number; rot: number; sx: number; sz: number; col: number }> = [];

    // Anillos de adoquines en plaza central
    for (let ring = 0; ring < 3; ring++) {
      const r = 3.4 + ring * 2.15;
      const count = 14 + ring * 10;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + ring * 0.21;
        positions.push({
          x: Math.cos(ang) * r,
          z: Math.sin(ang) * r,
          rot: -ang,
          sx: 0.9 + ((i * 13) % 5) * 0.07,
          sz: 0.85 + ((i * 7) % 4) * 0.08,
          col: (i + ring) % 3 === 0 ? 0x8d877d : (i + ring) % 3 === 1 ? 0x777168 : 0x999082,
        });
      }
    }

    // Adoquines en los 4 ejes hacia las puertas
    for (const dir of [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]) {
      const cos = Math.cos(dir);
      const sin = Math.sin(dir);
      const perpX = -sin;
      const perpZ = cos;
      for (let d = 9.5; d <= 26; d += 1.45) {
        for (const lane of [-1.05, 0, 1.05]) {
          const jitter = Math.sin(d * 3.1 + lane * 4.7) * 0.12;
          positions.push({
            x: cos * d + perpX * (lane + jitter),
            z: sin * d + perpZ * (lane + jitter),
            rot: dir + jitter * 0.4,
            sx: 0.95,
            sz: 0.9,
            col: Math.floor(d + Math.abs(lane) * 3) % 2 === 0 ? 0x878076 : 0x746e66,
          });
        }
      }
    }

    const cobbleInst = new THREE.InstancedMesh(cobbleGeo, cobbleMat, positions.length);
    cobbleInst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const tmpCol = new THREE.Color();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      dummy.position.set(p.x, 0.042, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.set(p.sx, 1, p.sz);
      dummy.updateMatrix();
      cobbleInst.setMatrixAt(i, dummy.matrix);
      tmpCol.setHex(p.col);
      cobbleInst.setColorAt(i, tmpCol);
    }
    cobbleInst.instanceMatrix.needsUpdate = true;
    if (cobbleInst.instanceColor) cobbleInst.instanceColor.needsUpdate = true;
    this.group.add(cobbleInst);
  }

  private buildFountain(): void {
    const stoneMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x8a8f99 }));
    const trimMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xb6bec9 }));
    const waterMat = this.trackMat(
      new THREE.MeshLambertMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.32,
        transparent: true,
        opacity: 0.86,
      })
    );
    this.fountainWaterMat = waterMat;

    // Estanque octogonal de piedra
    const outerBasinGeo = this.trackGeo(new THREE.CylinderGeometry(2.3, 2.55, 0.56, 8));
    const outerBasin = new THREE.Mesh(outerBasinGeo, stoneMat);
    outerBasin.position.y = 0.28;
    outerBasin.castShadow = true;
    outerBasin.receiveShadow = true;
    this.group.add(outerBasin);

    const rimGeo = this.trackGeo(new THREE.TorusGeometry(2.15, 0.16, 6, 8));
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, trimMat);
    rim.position.y = 0.56;
    rim.castShadow = true;
    this.group.add(rim);

    // Disco de agua
    const waterGeo = this.trackGeo(new THREE.CircleGeometry(2.05, 16));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = 0.5;
    this.group.add(waterMesh);

    // Pedestal central y taza superior
    const pillarGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.48, 1.55, 8));
    const pillar = new THREE.Mesh(pillarGeo, stoneMat);
    pillar.position.y = 0.85;
    pillar.castShadow = true;
    this.group.add(pillar);

    const topBowlGeo = this.trackGeo(new THREE.CylinderGeometry(0.88, 0.42, 0.28, 8));
    const topBowl = new THREE.Mesh(topBowlGeo, trimMat);
    topBowl.position.y = 1.62;
    topBowl.castShadow = true;
    this.group.add(topBowl);

    // Chorro de agua animado (escala y pulsación con Math.sin(time))
    const jetGeo = this.trackGeo(new THREE.ConeGeometry(0.26, 1.05, 10, 1, true));
    const jet = new THREE.Mesh(jetGeo, waterMat);
    jet.position.y = 2.22;
    this.fountainJet = jet;
    this.group.add(jet);

    // Onda expansiva en el agua
    const splashGeo = this.trackGeo(new THREE.RingGeometry(0.65, 0.88, 18));
    splashGeo.rotateX(-Math.PI / 2);
    const splash = new THREE.Mesh(splashGeo, waterMat);
    splash.position.y = 0.52;
    this.fountainSplashRing = splash;
    this.group.add(splash);

    // Colisionador central de la fuente
    this.colliders.push({ x: LANDMARKS.village.x, z: LANDMARKS.village.z, r: 2.4 });
  }

  private buildPerimeterWalls(cx: number, cz: number): void {
    const brickGeo = this.trackGeo(new THREE.BoxGeometry(2.15, 1.48, 2.0));
    const merlonGeo = this.trackGeo(new THREE.BoxGeometry(0.95, 0.72, 0.85));
    const brickMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const merlonMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x8a8780 }));

    const gateAngles = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5];
    const gateHalfAngle = 0.115; // ~2.85m clearance each side of gate centerline

    const brickTransforms: Array<{ x: number; y: number; z: number; rotY: number; col: number }> = [];
    const merlonTransforms: Array<{ x: number; y: number; z: number; rotY: number }> = [];

    const totalArcSteps = 76;
    for (let i = 0; i < totalArcSteps; i++) {
      const ang = (i / totalArcSteps) * Math.PI * 2 - Math.PI;
      let nearGate = false;
      for (let g = 0; g < gateAngles.length; g++) {
        let diff = ang - gateAngles[g];
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < gateHalfAngle) {
          nearGate = true;
          break;
        }
      }
      if (nearGate) continue;

      const x = Math.cos(ang) * CITY_RADIUS;
      const z = Math.sin(ang) * CITY_RADIUS;
      const rotY = -ang + Math.PI * 0.5;

      // 2 hiladas de ladrillo por segmento (altura total 3.0m)
      brickTransforms.push({
        x,
        y: 0.74,
        z,
        rotY,
        col: i % 2 === 0 ? 0x726d66 : 0x67625b,
      });
      brickTransforms.push({
        x,
        y: 2.22,
        z,
        rotY: rotY + 0.02,
        col: i % 2 === 0 ? 0x7c766e : 0x6e6860,
      });

      // Almenas alternadas arriba de la muralla
      if (i % 2 === 0) {
        merlonTransforms.push({
          x: Math.cos(ang) * (CITY_RADIUS + 0.42),
          y: 3.34,
          z: Math.sin(ang) * (CITY_RADIUS + 0.42),
          rotY,
        });
      }

      // Colisionador circular de muralla (deja las 4 entradas completamente libres)
      this.colliders.push({ x: cx + x, z: cz + z, r: 1.25 });
    }

    const brickInst = new THREE.InstancedMesh(brickGeo, brickMat, brickTransforms.length);
    brickInst.castShadow = true;
    brickInst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const tmpCol = new THREE.Color();
    for (let i = 0; i < brickTransforms.length; i++) {
      const t = brickTransforms[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      brickInst.setMatrixAt(i, dummy.matrix);
      tmpCol.setHex(t.col);
      brickInst.setColorAt(i, tmpCol);
    }
    brickInst.instanceMatrix.needsUpdate = true;
    if (brickInst.instanceColor) brickInst.instanceColor.needsUpdate = true;
    this.group.add(brickInst);

    const merlonInst = new THREE.InstancedMesh(merlonGeo, merlonMat, merlonTransforms.length);
    merlonInst.castShadow = true;
    for (let i = 0; i < merlonTransforms.length; i++) {
      const m = merlonTransforms[i];
      dummy.position.set(m.x, m.y, m.z);
      dummy.rotation.set(0, m.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      merlonInst.setMatrixAt(i, dummy.matrix);
    }
    merlonInst.instanceMatrix.needsUpdate = true;
    this.group.add(merlonInst);
  }

  private buildCardinalGates(
    cx: number,
    cz: number,
    baseY: number,
    worldTorches: TorchEntry[]
  ): void {
    // Arco de puerta usando ShapeGeometry / ExtrudeGeometry
    const archShape = new THREE.Shape();
    archShape.moveTo(-3.3, 0);
    archShape.lineTo(-3.3, 4.9);
    archShape.lineTo(3.3, 4.9);
    archShape.lineTo(3.3, 0);
    archShape.lineTo(2.05, 0);
    archShape.lineTo(2.05, 2.35);
    archShape.absarc(0, 2.35, 2.05, 0, Math.PI, false);
    archShape.lineTo(-2.05, 0);
    archShape.closePath();

    const archGeo = this.trackGeo(
      new THREE.ExtrudeGeometry(archShape, {
        depth: 2.3,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 2,
        curveSegments: 14,
      })
    );
    archGeo.translate(0, 0, -1.15);

    const archTrimGeo = this.trackGeo(new THREE.ShapeGeometry(archShape, 12));
    archTrimGeo.translate(0, 0, 1.24);

    const archMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x6b6761 }));
    const trimMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x8f887d }));
    const goldCrestMat = this.trackMat(
      new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x5c4212, emissiveIntensity: 0.2 })
    );
    const towerGeo = this.trackGeo(new THREE.CylinderGeometry(0.95, 1.08, 5.4, 8));
    const towerCapGeo = this.trackGeo(new THREE.ConeGeometry(1.22, 1.3, 8));
    const roofMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x2f4875 }));
    const crestGeo = this.trackGeo(new THREE.OctahedronGeometry(0.35, 0));

    // Postes de madera exteriores señalando la zona de mobs
    const postGeo = this.trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6));
    const boardGeo = this.trackGeo(new THREE.BoxGeometry(1.15, 0.42, 0.12));
    const woodMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x5b3c21 }));
    const signMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xc49c62 }));

    const gates = getCityGateSpecs();
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const gateGrp = new THREE.Group();
      const relX = g.x - cx;
      const relZ = g.z - cz;
      gateGrp.position.set(relX, 0, relZ);
      gateGrp.rotation.y = Math.atan2(g.outwardX, g.outwardZ);

      const archMesh = new THREE.Mesh(archGeo, archMat);
      archMesh.castShadow = true;
      archMesh.receiveShadow = true;
      gateGrp.add(archMesh);

      const frontTrim = new THREE.Mesh(archTrimGeo, trimMat);
      gateGrp.add(frontTrim);

      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(towerGeo, archMat);
        tower.position.set(side * 3.15, 2.7, 0);
        tower.castShadow = true;
        tower.receiveShadow = true;
        gateGrp.add(tower);

        const cap = new THREE.Mesh(towerCapGeo, roofMat);
        cap.position.set(side * 3.15, 6.0, 0);
        cap.castShadow = true;
        gateGrp.add(cap);

        // Colisionadores de los pilares del portón (dejan el arco de ~4.1m libre)
        const worldPillarX = g.x + Math.cos(gateGrp.rotation.y) * side * 2.85;
        const worldPillarZ = g.z - Math.sin(gateGrp.rotation.y) * side * 2.85;
        this.colliders.push({ x: worldPillarX, z: worldPillarZ, r: 0.95 });
      }

      const crest = new THREE.Mesh(crestGeo, goldCrestMat);
      crest.position.set(0, 4.45, 1.32);
      gateGrp.add(crest);

      // Antorcha / farol lateral junto al portón interior
      const lanternX = g.x - g.outwardX * 1.9 + (-g.outwardZ) * 2.4;
      const lanternZ = g.z - g.outwardZ * 1.9 + g.outwardX * 2.4;
      this.addLantern(lanternX, lanternZ, cx, cz, baseY, worldTorches);

      // Poste indicador fuera de la muralla
      const signPostX = relX + g.outwardX * 2.8 + (-g.outwardZ) * 2.5;
      const signPostZ = relZ + g.outwardZ * 2.8 + g.outwardX * 2.5;
      const signGrp = new THREE.Group();
      signGrp.position.set(signPostX, 0, signPostZ);
      signGrp.rotation.y = Math.atan2(g.outwardX, g.outwardZ);
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.y = 0.75;
      post.castShadow = true;
      const board = new THREE.Mesh(boardGeo, signMat);
      board.position.set(0, 1.3, 0.05);
      board.castShadow = true;
      signGrp.add(post, board);
      this.group.add(signGrp);

      this.group.add(gateGrp);
    }
  }

  private buildDistrictBuildings(
    cx: number,
    cz: number,
    windowMaterials: THREE.MeshLambertMaterial[]
  ): void {
    const stoneMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x626770 }));
    const plasterMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xdccdb8 }));
    const timberMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x4b301b }));
    const ironMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x3b4048 }));
    const goldMat = this.trackMat(
      new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x453209, emissiveIntensity: 0.25 })
    );

    const roofMats: Record<CityBuildingSpot['id'], THREE.MeshLambertMaterial> = {
      bank: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x7c6028 })),
      smith: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x6f2d23 })),
      shop: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x2b6e4e })),
      tavern: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x8f3328 })),
      elder: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x2c4b7a })),
      barracks: this.trackMat(new THREE.MeshLambertMaterial({ color: 0x465163 })),
    };

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(5.2, 0.45, 4.2));
    const bodyGeo = this.trackGeo(new THREE.BoxGeometry(4.7, 2.75, 3.8));
    const doorGeo = this.trackGeo(new THREE.BoxGeometry(1.05, 1.65, 0.16));
    const roofGeo = this.trackGeo(new THREE.ConeGeometry(3.8, 2.25, 4));
    roofGeo.rotateY(Math.PI / 4);
    const windowGeo = this.trackGeo(new THREE.BoxGeometry(0.76, 0.76, 0.14));

    const spots = getCityBuildingSpots();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const bGrp = new THREE.Group();
      const rx = s.x - cx;
      const rz = s.z - cz;
      bGrp.position.set(rx, 0, rz);
      // Mira hacia el centro de la plaza (0, 0)
      bGrp.rotation.y = Math.atan2(-rx, -rz);

      const scaleW = s.id === 'tavern' ? 1.18 : 1.0;
      const bInner = new THREE.Group();
      bInner.scale.set(scaleW, 1, scaleW);
      bGrp.add(bInner);

      const plinth = new THREE.Mesh(plinthGeo, stoneMat);
      plinth.position.y = 0.22;
      plinth.castShadow = true;
      plinth.receiveShadow = true;

      const body = new THREE.Mesh(bodyGeo, plasterMat);
      body.position.y = 1.82;
      body.castShadow = true;
      body.receiveShadow = true;

      const door = new THREE.Mesh(doorGeo, timberMat);
      door.position.set(0, 1.28, 1.92);

      const roof = new THREE.Mesh(roofGeo, roofMats[s.id]);
      roof.position.y = 4.28;
      roof.castShadow = true;

      bInner.add(plinth, body, door, roof);

      // Ventanas cálidas nocturnas
      const winMat = this.trackMat(
        new THREE.MeshLambertMaterial({
          color: s.id === 'tavern' ? 0xffd27d : 0xfde68a,
          emissive: 0xff9f1c,
          emissiveIntensity: s.id === 'tavern' ? 0.6 : 0.4,
        })
      );
      windowMaterials.push(winMat);
      if (s.id === 'tavern') this.tavernWindowMats.push(winMat);

      for (const wx of [-1.4, 1.4]) {
        const w = new THREE.Mesh(windowGeo, winMat);
        w.position.set(wx, 2.0, 1.9);
        bInner.add(w);
      }

      // Vigas esquineras de madera
      const beamGeo = this.trackGeo(new THREE.BoxGeometry(0.24, 2.8, 0.24));
      for (const bx of [-2.3, 2.3]) {
        for (const bz of [-1.86, 1.86]) {
          const beam = new THREE.Mesh(beamGeo, timberMat);
          beam.position.set(bx, 1.85, bz);
          beam.castShadow = true;
          bInner.add(beam);
        }
      }

      // Rasgos únicos por edificio
      if (s.id === 'smith') {
        // Chimenea + yunque exterior + humo animable (THREE.Points)
        const chimGeo = this.trackGeo(new THREE.BoxGeometry(0.85, 2.1, 0.85));
        const chim = new THREE.Mesh(chimGeo, stoneMat);
        chim.position.set(1.5, 4.4, -0.6);
        chim.castShadow = true;
        bInner.add(chim);

        // Yunque frente a la herrería
        const anvilBase = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.75, 0.45, 0.45)), ironMat);
        anvilBase.position.set(-1.35, 0.22, 2.75);
        anvilBase.castShadow = true;
        const anvilTop = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.95, 0.28, 0.42)), ironMat);
        anvilTop.position.set(-1.35, 0.58, 2.75);
        anvilTop.castShadow = true;
        bInner.add(anvilBase, anvilTop);

        // Posición mundial local de la chimenea para humo
        const worldChim = new THREE.Vector3(1.5, 5.55, -0.6).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          bGrp.rotation.y
        );
        this.chimneyOrigin.set(rx + worldChim.x, worldChim.y, rz + worldChim.z);
        this.buildChimneySmoke();
      } else if (s.id === 'shop') {
        // Toldo rayado rojo y oro sin texturas + mostrador
        const stripeColors = [0xc0392b, 0xf1c40f];
        const slatGeo = this.trackGeo(new THREE.BoxGeometry(0.62, 0.08, 1.35));
        for (let k = 0; k < 6; k++) {
          const slatMat = this.trackMat(new THREE.MeshLambertMaterial({ color: stripeColors[k % 2] }));
          const slat = new THREE.Mesh(slatGeo, slatMat);
          slat.position.set(-1.55 + k * 0.62, 2.25, 2.48);
          slat.rotation.x = 0.26;
          slat.castShadow = true;
          bInner.add(slat);
        }
      } else if (s.id === 'bank') {
        // Bóveda frontal con emblema dorado
        const crest = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12)), goldMat);
        crest.rotation.x = Math.PI / 2;
        crest.position.set(0, 2.95, 1.98);
        bInner.add(crest);
      } else if (s.id === 'tavern') {
        // Letrero colgante + mesa exterior
        const arm = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.1, 0.1, 0.9)), ironMat);
        arm.position.set(1.65, 2.55, 2.35);
        const sign = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.1, 0.55, 0.65)), goldMat);
        sign.position.set(1.65, 2.2, 2.55);
        bInner.add(arm, sign);
      } else if (s.id === 'barracks') {
        // Estandartes azules de la guardia
        const bannerMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x2563eb }));
        const bannerGeo = this.trackGeo(new THREE.BoxGeometry(0.48, 1.45, 0.08));
        for (const bx of [-1.2, 1.2]) {
          const banner = new THREE.Mesh(bannerGeo, bannerMat);
          banner.position.set(bx, 2.1, 1.96);
          bInner.add(banner);
        }
      }

      this.group.add(bGrp);
      this.colliders.push({ x: s.x, z: s.z, r: 2.95 * scaleW });
    }
  }

  private buildChimneySmoke(): void {
    const count = 18;
    this.smokePositions = new Float32Array(count * 3);
    this.smokeSeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.smokeSeeds[i] = i / count;
      this.smokePositions[i * 3] = this.chimneyOrigin.x;
      this.smokePositions[i * 3 + 1] = this.chimneyOrigin.y;
      this.smokePositions[i * 3 + 2] = this.chimneyOrigin.z;
    }
    this.smokeGeo = this.trackGeo(new THREE.BufferGeometry());
    this.smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    const smokeMat = this.trackMat(
      new THREE.PointsMaterial({
        color: 0xd1d5db,
        size: 0.42,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      })
    );
    this.smokePoints = new THREE.Points(this.smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
    this.group.add(this.smokePoints);
  }

  private addLantern(
    wx: number,
    wz: number,
    cx: number,
    cz: number,
    baseY: number,
    worldTorches: TorchEntry[]
  ): void {
    const postMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x3b4048 }));
    const flameMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    const postGeo = this.trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 2.25, 6));
    const capGeo = this.trackGeo(new THREE.ConeGeometry(0.28, 0.25, 6));
    const flameGeo = this.trackGeo(new THREE.OctahedronGeometry(0.18, 0));

    const lGrp = new THREE.Group();
    lGrp.position.set(wx - cx, 0, wz - cz);

    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1.12;
    post.castShadow = true;
    const cap = new THREE.Mesh(capGeo, postMat);
    cap.position.y = 2.52;
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 2.3;
    lGrp.add(post, cap, flame);
    this.group.add(lGrp);

    worldTorches.push({
      x: wx,
      y: baseY + 2.35,
      z: wz,
      flame,
      baseIntensity: 3.4,
      phase: (Math.abs(wx) + Math.abs(wz)) * 0.37,
    });
  }

  private buildUrbanProps(
    cx: number,
    cz: number,
    baseY: number,
    worldTorches: TorchEntry[]
  ): void {
    // 4 faroles en las esquinas de la plaza central
    const plazaLanternAngles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.75, -Math.PI * 0.25];
    for (let i = 0; i < plazaLanternAngles.length; i++) {
      const a = plazaLanternAngles[i];
      this.addLantern(cx + Math.cos(a) * 8.1, cz + Math.sin(a) * 8.1, cx, cz, baseY, worldTorches);
    }

    // Barriles y cajas instanciados cerca de edificios y puerta Sur
    const barrelGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.34, 0.72, 8));
    const barrelMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x7a4c28 }));
    const crateGeo = this.trackGeo(new THREE.BoxGeometry(0.68, 0.68, 0.68));
    const crateMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0x9b6b3b }));
    const potGeo = this.trackGeo(new THREE.CylinderGeometry(0.34, 0.24, 0.38, 7));
    const potMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xa45435 }));
    const flowerGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.28, 0));
    const flowerMat = this.trackMat(new THREE.MeshLambertMaterial({ color: 0xffffff }));

    const spots = getCityBuildingSpots();
    const barrelSpots: Array<{ x: number; z: number }> = [];
    const crateSpots: Array<{ x: number; z: number; rot: number }> = [];

    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const rx = s.x - cx;
      const rz = s.z - cz;
      const len = Math.hypot(rx, rz) || 1;
      const sideX = -rz / len;
      const sideZ = rx / len;
      const fwdX = -rx / len;
      const fwdZ = -rz / len;

      if (s.id === 'tavern' || s.id === 'shop' || s.id === 'bank') {
        barrelSpots.push({
          x: rx + sideX * 2.9 + fwdX * 1.4,
          z: rz + sideZ * 2.9 + fwdZ * 1.4,
        });
        barrelSpots.push({
          x: rx + sideX * 3.55 + fwdX * 1.0,
          z: rz + sideZ * 3.55 + fwdZ * 1.0,
        });
      }
      if (s.id === 'shop' || s.id === 'barracks' || s.id === 'smith') {
        crateSpots.push({
          x: rx - sideX * 2.95 + fwdX * 1.2,
          z: rz - sideZ * 2.95 + fwdZ * 1.2,
          rot: s.angle,
        });
      }
    }

    const dummy = new THREE.Object3D();
    if (barrelSpots.length > 0) {
      const bInst = new THREE.InstancedMesh(barrelGeo, barrelMat, barrelSpots.length);
      bInst.castShadow = true;
      bInst.receiveShadow = true;
      for (let i = 0; i < barrelSpots.length; i++) {
        dummy.position.set(barrelSpots[i].x, 0.36, barrelSpots[i].z);
        dummy.rotation.set(0, i * 0.5, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bInst.setMatrixAt(i, dummy.matrix);
      }
      bInst.instanceMatrix.needsUpdate = true;
      this.group.add(bInst);
    }

    if (crateSpots.length > 0) {
      const cInst = new THREE.InstancedMesh(crateGeo, crateMat, crateSpots.length);
      cInst.castShadow = true;
      cInst.receiveShadow = true;
      for (let i = 0; i < crateSpots.length; i++) {
        dummy.position.set(crateSpots[i].x, 0.34, crateSpots[i].z);
        dummy.rotation.set(0, crateSpots[i].rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cInst.setMatrixAt(i, dummy.matrix);
      }
      cInst.instanceMatrix.needsUpdate = true;
      this.group.add(cInst);
    }

    // Macetas florales alrededor de la fuente/plaza (r = 5.4)
    const potCount = 8;
    const pInst = new THREE.InstancedMesh(potGeo, potMat, potCount);
    const fInst = new THREE.InstancedMesh(flowerGeo, flowerMat, potCount);
    pInst.castShadow = true;
    const flowerCols = [0xe11d48, 0xf59e0b, 0x38bdf8, 0xa855f7];
    const tmpCol = new THREE.Color();
    for (let i = 0; i < potCount; i++) {
      const ang = (i / potCount) * Math.PI * 2 + Math.PI * 0.125;
      const px = Math.cos(ang) * 5.4;
      const pz = Math.sin(ang) * 5.4;
      dummy.position.set(px, 0.19, pz);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, 0.48, pz);
      dummy.updateMatrix();
      fInst.setMatrixAt(i, dummy.matrix);
      tmpCol.setHex(flowerCols[i % flowerCols.length]);
      fInst.setColorAt(i, tmpCol);
    }
    pInst.instanceMatrix.needsUpdate = true;
    fInst.instanceMatrix.needsUpdate = true;
    if (fInst.instanceColor) fInst.instanceColor.needsUpdate = true;
    this.group.add(pInst, fInst);
  }

  public update(elapsed: number, nightFactor: number): void {
    // 1. Fuente animada (chorro y onda de agua con Math.sin(time))
    if (this.fountainJet) {
      const pulse = 0.84 + Math.sin(elapsed * 4.8) * 0.2;
      this.fountainJet.scale.set(1, pulse, 1);
      this.fountainJet.position.y = 1.78 + 0.46 * pulse;
      this.fountainJet.rotation.y = elapsed * 1.4;
    }
    if (this.fountainSplashRing) {
      const wave = (elapsed * 0.9) % 1;
      const s = 0.65 + wave * 1.45;
      this.fountainSplashRing.scale.set(s, 1, s);
      if (this.fountainWaterMat) {
        this.fountainWaterMat.emissiveIntensity = 0.28 + nightFactor * 0.35 + Math.sin(elapsed * 3.2) * 0.06;
      }
    }

    // 2. Humo de la chimenea de la herrería
    if (this.smokePoints && this.smokeGeo && this.smokePositions && this.smokeSeeds) {
      const count = this.smokeSeeds.length;
      for (let i = 0; i < count; i++) {
        const t = (elapsed * 0.34 + this.smokeSeeds[i]) % 1;
        const i3 = i * 3;
        this.smokePositions[i3] = this.chimneyOrigin.x + Math.sin(elapsed * 1.6 + i) * (0.18 + t * 0.55) + t * 0.35;
        this.smokePositions[i3 + 1] = this.chimneyOrigin.y + t * 3.2;
        this.smokePositions[i3 + 2] = this.chimneyOrigin.z + Math.cos(elapsed * 1.3 + i) * (0.16 + t * 0.42);
      }
      (this.smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // 3. Ventanas de taberna más cálidas al anochecer
    for (let i = 0; i < this.tavernWindowMats.length; i++) {
      this.tavernWindowMats[i].emissiveIntensity = 0.35 + nightFactor * 0.95;
    }
  }

  public dispose(): void {
    for (let i = 0; i < this.geos.length; i++) this.geos[i].dispose();
    for (let i = 0; i < this.mats.length; i++) this.mats[i].dispose();
    this.geos.length = 0;
    this.mats.length = 0;
    this.tavernWindowMats.length = 0;
  }
}
