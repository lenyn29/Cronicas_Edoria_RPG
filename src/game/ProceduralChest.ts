import * as THREE from 'three';
import {
  createContactShadowMaterial,
  createEntityOutlineMaterial,
  createEntityShaderMaterial,
} from './core/EntityShader';
import { computeHighlightHex, computeShadowHex, PALETTE_32 } from './core/Palette';

const KEYHOLE_GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const KEYHOLE_GLOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    float pulse = 0.55 + 0.45 * sin(uTime * 3.1);
    float dist = length(vUv - vec2(0.5)) * 2.0;
    float falloff = smoothstep(1.0, 0.1, dist);
    gl_FragColor = vec4(uColor * (0.9 + 0.35 * pulse), falloff * (0.35 + 0.35 * pulse));
  }
`;

export class ProceduralChest {
  public readonly group = new THREE.Group();
  private readonly bodyMaterials: THREE.ShaderMaterial[] = [];
  private readonly outlineMaterials: THREE.ShaderMaterial[] = [];
  private readonly keyholeGlowMat: THREE.ShaderMaterial;
  private readonly lidGroup = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly baseOutlineWidths: number[] = [];
  private elapsed = 0;

  constructor() {
    this.keyholeGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xc9a227) },
      },
      vertexShader: KEYHOLE_GLOW_VERT,
      fragmentShader: KEYHOLE_GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.buildChest();
  }

  private createMat(baseHex: number, rimStrength = 0.35, unlitGlow = false): THREE.ShaderMaterial {
    const mat = createEntityShaderMaterial({
      baseColor: baseHex,
      shadowColor: computeShadowHex(baseHex),
      highlightColor: computeHighlightHex(baseHex),
      rimStrength,
      unlitGlow,
    });
    this.bodyMaterials.push(mat);
    return mat;
  }

  private addExtruded(
    parent: THREE.Object3D,
    shape: THREE.Shape,
    depth: number,
    colorHex: number,
    x: number,
    y: number,
    z: number,
    outlineWidth = 0.018,
    rimStrength = 0.35,
    unlitGlow = false
  ): THREE.Mesh {
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.014,
      bevelSegments: 2,
      curveSegments: 10,
    });
    geom.translate(0, 0, -depth * 0.5);
    this.geometries.push(geom);

    const mesh = new THREE.Mesh(geom, this.createMat(colorHex, rimStrength, unlitGlow));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (outlineWidth > 0) {
      const outlineMat = createEntityOutlineMaterial(outlineWidth, 1.0, PALETTE_32.CONTORNO);
      this.outlineMaterials.push(outlineMat);
      this.baseOutlineWidths.push(outlineWidth);
      const outlineMesh = new THREE.Mesh(geom, outlineMat);
      outlineMesh.renderOrder = -1;
      mesh.add(outlineMesh);
    }

    parent.add(mesh);
    return mesh;
  }

  private buildChest(): void {
    const WOOD_DARK = 0x5a3a1a;
    const WOOD_TRIM = 0x452b12;
    const GOLD_METAL = 0xc9a227;
    const DARK_IRON = 0x262930;

    // Sombra de contacto
    const shadowGeom = new THREE.PlaneGeometry(1.42, 1.04);
    shadowGeom.rotateX(-Math.PI / 2);
    this.geometries.push(shadowGeom);
    const shadowMesh = new THREE.Mesh(shadowGeom, createContactShadowMaterial(0.45));
    shadowMesh.position.y = 0.02;
    this.group.add(shadowMesh);

    // 1. Base rectangular de madera oscura (ShapeGeometry extruida)
    const baseShape = new THREE.Shape();
    const bw = 0.52;
    const bh = 0.44;
    baseShape.moveTo(-bw, 0);
    baseShape.lineTo(bw, 0);
    baseShape.lineTo(bw, bh);
    baseShape.lineTo(-bw, bh);
    baseShape.closePath();
    this.addExtruded(this.group, baseShape, 0.62, WOOD_DARK, 0, 0.04, 0, 0.02);

    // Moldura inferior oscura
    const plinthShape = new THREE.Shape();
    plinthShape.moveTo(-bw - 0.03, 0);
    plinthShape.lineTo(bw + 0.03, 0);
    plinthShape.lineTo(bw + 0.03, 0.07);
    plinthShape.lineTo(-bw - 0.03, 0.07);
    plinthShape.closePath();
    this.addExtruded(this.group, plinthShape, 0.67, WOOD_TRIM, 0, 0.02, 0, 0.015);

    // 2. Tapa superior curva (semicírculo achatado en Shape)
    this.lidGroup.position.set(0, 0.48, 0);
    this.group.add(this.lidGroup);

    const lidShape = new THREE.Shape();
    const lw = 0.53;
    const lh = 0.24;
    lidShape.moveTo(-lw, 0);
    lidShape.lineTo(lw, 0);
    lidShape.absarc(0, 0, lw, 0, Math.PI, false);
    lidShape.closePath();

    const lidGeom = new THREE.ExtrudeGeometry(lidShape, {
      depth: 0.64,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.014,
      bevelSegments: 2,
      curveSegments: 14,
    });
    lidGeom.translate(0, 0, -0.32);
    // Achatamos verticalmente el semicírculo para un perfil de tapa de cofre clásico
    lidGeom.scale(1, lh / lw, 1);
    this.geometries.push(lidGeom);

    const lidMesh = new THREE.Mesh(lidGeom, this.createMat(WOOD_DARK, 0.36));
    lidMesh.castShadow = true;
    lidMesh.receiveShadow = true;
    const lidOutline = createEntityOutlineMaterial(0.02, 1.0, PALETTE_32.CONTORNO);
    this.outlineMaterials.push(lidOutline);
    this.baseOutlineWidths.push(0.02);
    const lidOutlineMesh = new THREE.Mesh(lidGeom, lidOutline);
    lidOutlineMesh.renderOrder = -1;
    lidMesh.add(lidOutlineMesh);
    this.lidGroup.add(lidMesh);

    // 3. 3 bandas metálicas doradas verticales (#c9a227) recorriendo base y tapa
    const bandXs = [-0.36, 0, 0.36];
    for (const bx of bandXs) {
      const bandBase = new THREE.Shape();
      bandBase.moveTo(-0.036, 0);
      bandBase.lineTo(0.036, 0);
      bandBase.lineTo(0.036, 0.46);
      bandBase.lineTo(-0.036, 0.46);
      bandBase.closePath();
      this.addExtruded(this.group, bandBase, 0.66, GOLD_METAL, bx, 0.03, 0, 0.012, 0.52);

      // Banda arqueada sobre la tapa
      const archShape = new THREE.Shape();
      archShape.moveTo(-0.036, 0);
      archShape.lineTo(0.036, 0);
      archShape.lineTo(0.036, 0.255);
      archShape.lineTo(-0.036, 0.255);
      archShape.closePath();
      const archGeom = new THREE.ExtrudeGeometry(archShape, {
        depth: 0.67,
        bevelEnabled: false,
      });
      archGeom.translate(0, 0, -0.335);
      this.geometries.push(archGeom);
      // Envolvemos cada banda sobre el arco usando una curva ligera escalada
      const archCrown = new THREE.Shape();
      archCrown.moveTo(-0.04, 0);
      archCrown.lineTo(0.04, 0);
      archCrown.quadraticCurveTo(0, 0.08, -0.04, 0);
      archCrown.closePath();
      this.addExtruded(this.lidGroup, archCrown, 0.68, GOLD_METAL, bx, 0.22, 0, 0.01, 0.55);

      const frontRim = new THREE.Shape();
      frontRim.moveTo(-0.038, 0);
      frontRim.lineTo(0.038, 0);
      frontRim.lineTo(0.038, 0.21);
      frontRim.lineTo(-0.038, 0.21);
      frontRim.closePath();
      this.addExtruded(this.lidGroup, frontRim, 0.05, GOLD_METAL, bx, 0.0, 0.33, 0.01, 0.55);
      this.addExtruded(this.lidGroup, frontRim, 0.05, GOLD_METAL, bx, 0.0, -0.33, 0.01, 0.55);
    }

    // Listón horizontal dorado de cierre entre base y tapa
    const latchBar = new THREE.Shape();
    latchBar.moveTo(-0.54, -0.025);
    latchBar.lineTo(0.54, -0.025);
    latchBar.lineTo(0.54, 0.025);
    latchBar.lineTo(-0.54, 0.025);
    latchBar.closePath();
    this.addExtruded(this.group, latchBar, 0.67, GOLD_METAL, 0, 0.47, 0, 0.014, 0.5);

    // 4. Cerradura frontal metálica con brillo sutil animado
    const lockPlate = new THREE.Shape();
    lockPlate.moveTo(-0.09, -0.11);
    lockPlate.lineTo(0.09, -0.11);
    lockPlate.lineTo(0.11, 0.07);
    lockPlate.lineTo(-0.11, 0.07);
    lockPlate.closePath();
    this.addExtruded(this.group, lockPlate, 0.06, GOLD_METAL, 0, 0.43, 0.34, 0.012, 0.65);

    // Ojo de la cerradura (ShapeGeometry)
    const keyholeShape = new THREE.Shape();
    keyholeShape.absarc(0, 0.018, 0.026, 0, Math.PI * 2, false);
    const keyholeSlot = new THREE.Shape();
    keyholeSlot.moveTo(-0.015, -0.055);
    keyholeSlot.lineTo(0.015, -0.055);
    keyholeSlot.lineTo(0.01, 0.01);
    keyholeSlot.lineTo(-0.01, 0.01);
    keyholeSlot.closePath();

    const khGeom = new THREE.ShapeGeometry(keyholeShape, 10);
    const khSlotGeom = new THREE.ShapeGeometry(keyholeSlot);
    this.geometries.push(khGeom, khSlotGeom);

    const darkMat = this.createMat(DARK_IRON, 0.1);
    const khCircle = new THREE.Mesh(khGeom, darkMat);
    khCircle.position.set(0, 0.43, 0.382);
    const khStem = new THREE.Mesh(khSlotGeom, darkMat);
    khStem.position.set(0, 0.43, 0.382);
    this.group.add(khCircle, khStem);

    // Halo dorado sutil pulsante sobre la cerradura
    const glowPlane = new THREE.PlaneGeometry(0.32, 0.32);
    this.geometries.push(glowPlane);
    const glowMesh = new THREE.Mesh(glowPlane, this.keyholeGlowMat);
    glowMesh.position.set(0, 0.43, 0.39);
    this.group.add(glowMesh);
  }

  public update(delta: number, lightDir: THREE.Vector3, ambientTint: THREE.Color): void {
    this.elapsed += delta;
    this.keyholeGlowMat.uniforms.uTime.value = this.elapsed;

    for (let i = 0; i < this.bodyMaterials.length; i++) {
      const uniforms = this.bodyMaterials[i].uniforms;
      uniforms.uTime.value = this.elapsed;
      uniforms.uLightDir.value.copy(lightDir);
      uniforms.uAmbientTint.value.copy(ambientTint);
    }
  }

  public setZoomOutline(zoomFactor: number): void {
    const scale = THREE.MathUtils.clamp(zoomFactor, 0.72, 1.45);
    for (let i = 0; i < this.outlineMaterials.length; i++) {
      this.outlineMaterials[i].uniforms.uOutlineWidth.value = this.baseOutlineWidths[i] * scale;
    }
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.bodyMaterials) m.dispose();
    for (const m of this.outlineMaterials) m.dispose();
    this.keyholeGlowMat.dispose();
  }
}
