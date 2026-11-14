import * as THREE from 'three';
import { HeroGender } from './Palette';

// Biblioteca reutilizable de formas procedurales (THREE.Shape) construidas con curvas Bézier y polígonos.
// Garantiza coherencia silueta entre héroe, enemigos, NPCs, ítems y biomas sin texturas externas.

export function createTorsoSilhouette(gender: HeroGender): THREE.Shape {
  const s = new THREE.Shape();
  if (gender === 'female') {
    // Hombros más estrechos, cintura entallada y cadera ligeramente más ancha
    s.moveTo(-0.17, 0.0);
    s.bezierCurveTo(-0.18, 0.10, -0.10, 0.21, -0.125, 0.28);
    s.quadraticCurveTo(-0.175, 0.38, -0.17, 0.44);
    s.quadraticCurveTo(-0.11, 0.48, -0.06, 0.47);
    s.quadraticCurveTo(0.0, 0.49, 0.06, 0.47);
    s.quadraticCurveTo(0.11, 0.48, 0.17, 0.44);
    s.quadraticCurveTo(0.175, 0.38, 0.125, 0.28);
    s.bezierCurveTo(0.10, 0.21, 0.18, 0.10, 0.17, 0.0);
    s.quadraticCurveTo(0.0, -0.03, -0.17, 0.0);
  } else {
    // Hombre: hombros notablemente más anchos, cintura firme y cadera estrecha
    s.moveTo(-0.145, 0.0);
    s.quadraticCurveTo(-0.17, 0.18, -0.245, 0.38);
    s.quadraticCurveTo(-0.21, 0.46, -0.085, 0.475);
    s.quadraticCurveTo(0.0, 0.49, 0.085, 0.475);
    s.quadraticCurveTo(0.21, 0.46, 0.245, 0.38);
    s.quadraticCurveTo(0.17, 0.18, 0.145, 0.0);
    s.quadraticCurveTo(0.0, -0.03, -0.145, 0.0);
  }
  return s;
}

export function createHeadSilhouette(gender: HeroGender): THREE.Shape {
  const s = new THREE.Shape();
  if (gender === 'female') {
    // Mandíbula suave y mentón delicado
    s.moveTo(0, -0.02);
    s.bezierCurveTo(-0.15, -0.01, -0.195, 0.14, -0.165, 0.31);
    s.quadraticCurveTo(0.0, 0.425, 0.165, 0.31);
    s.bezierCurveTo(0.195, 0.14, 0.15, -0.01, 0.0, -0.02);
  } else {
    // Hombre: mandíbula angular más marcada y leve asimetría cansada
    s.moveTo(0, -0.02);
    s.lineTo(-0.12, 0.03);
    s.quadraticCurveTo(-0.21, 0.16, -0.175, 0.32);
    s.quadraticCurveTo(0.0, 0.43, 0.175, 0.31);
    s.quadraticCurveTo(0.21, 0.15, 0.125, 0.015);
    s.lineTo(0, -0.02);
  }
  return s;
}

// Gota invertida orgánica para Slime (base irregular aplastada)
export function createDropShape(width = 0.42, height = 0.62, asymmetric = true): THREE.Shape {
  const s = new THREE.Shape();
  const bulge = asymmetric ? 0.045 : 0;
  s.moveTo(-width * 0.92, 0.04);
  s.quadraticCurveTo(-width * 0.48, -0.03, 0.0, 0.02);
  s.quadraticCurveTo(width * 0.48, -0.025, width * 0.95, 0.05);
  s.bezierCurveTo(width * 1.05, height * 0.36, width * 0.66 + bulge, height * 0.78, 0.04, height);
  s.bezierCurveTo(-width * 0.56, height * 0.85, -width * 1.04, height * 0.38, -width * 0.92, 0.04);
  return s;
}

export function createLeafShape(width = 0.22, height = 0.44): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-width, height * 0.28, -width * 0.82, height * 0.76, 0, height);
  s.bezierCurveTo(width * 0.82, height * 0.76, width, height * 0.28, 0, 0);
  return s;
}

export function createMushroomShape(stemW = 0.08, capW = 0.26, h = 0.36): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-stemW, 0);
  s.quadraticCurveTo(-stemW * 0.8, h * 0.48, -capW, h * 0.54);
  s.bezierCurveTo(-capW * 1.05, h * 0.98, capW * 1.05, h * 0.98, capW, h * 0.54);
  s.quadraticCurveTo(stemW * 0.8, h * 0.48, stemW, 0);
  s.closePath();
  return s;
}

// Polígono rocoso angular (gólems, rocas de montaña)
export function createRockPolygonShape(rx = 0.35, ry = 0.4, seed = 1): THREE.Shape {
  const s = new THREE.Shape();
  const pts = 7;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const jitter = 0.76 + (((Math.sin(i * 19.3 + seed * 7.1) + 1) * 0.5) * 0.36);
    const px = Math.cos(a) * rx * jitter;
    const py = Math.sin(a) * ry * jitter;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

export function createStarShape(outerR = 0.22, innerR = 0.09, points = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI * 0.5;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

export function createFlameShape(w = 0.18, h = 0.42): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-w * 1.2, h * 0.22, -w * 0.9, h * 0.62, -w * 0.18, h);
  s.quadraticCurveTo(0.02, h * 0.72, w * 0.32, h * 0.88);
  s.bezierCurveTo(w * 1.1, h * 0.56, w * 1.15, h * 0.22, 0, 0);
  return s;
}

export function createCrystalShape(w = 0.15, h = 0.46): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.68, 0);
  s.lineTo(-w, h * 0.58);
  s.lineTo(0, h);
  s.lineTo(w, h * 0.54);
  s.lineTo(w * 0.68, 0);
  s.closePath();
  return s;
}

export function createTrunkShape(baseW = 0.16, topW = 0.1, h = 0.85): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-baseW * 1.25, 0);
  s.quadraticCurveTo(-baseW * 0.65, h * 0.25, -topW, h);
  s.lineTo(topW, h);
  s.quadraticCurveTo(baseW * 0.65, h * 0.25, baseW * 1.25, 0);
  s.closePath();
  return s;
}

// Hueso clásico con cóndilos redondeados en ambos extremos (para Esqueleto)
export function createBoneShape(length = 0.28, thickness = 0.036): THREE.Shape {
  const s = new THREE.Shape();
  const knob = thickness * 1.75;
  s.moveTo(-knob, 0.02);
  s.quadraticCurveTo(-knob * 1.15, -knob * 0.6, 0, -knob * 0.35);
  s.quadraticCurveTo(knob * 1.15, -knob * 0.6, knob, 0.02);
  s.lineTo(thickness, -length + 0.04);
  s.quadraticCurveTo(knob * 1.15, -length - knob * 0.4, 0, -length - knob * 0.15);
  s.quadraticCurveTo(-knob * 1.15, -length - knob * 0.4, -knob, -length + 0.04);
  s.lineTo(-thickness, 0.0);
  s.closePath();
  return s;
}

// Formas icónicas para los 10 arquetipos de Ítems (legibles a 16x16 / 24x24)
export function createBottleShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.15, 0.0);
  s.bezierCurveTo(-0.22, 0.08, -0.20, 0.24, -0.06, 0.30);
  s.lineTo(-0.055, 0.42);
  s.lineTo(-0.08, 0.44);
  s.lineTo(-0.08, 0.48);
  s.lineTo(0.08, 0.48);
  s.lineTo(0.08, 0.44);
  s.lineTo(0.055, 0.42);
  s.lineTo(0.06, 0.30);
  s.bezierCurveTo(0.20, 0.24, 0.22, 0.08, 0.15, 0.0);
  s.closePath();
  return s;
}

export function createSwordBladeShape(w = 0.05, len = 0.56): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w * 0.86, len * 0.78);
  s.lineTo(0, len);
  s.lineTo(w * 0.86, len * 0.78);
  s.lineTo(w, 0);
  s.closePath();
  return s;
}

export function createDaggerBladeShape(w = 0.036, len = 0.38): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.quadraticCurveTo(-w * 1.1, len * 0.55, 0, len);
  s.quadraticCurveTo(w * 1.1, len * 0.55, w, 0);
  s.closePath();
  return s;
}

export function createShieldShape(w = 0.21, h = 0.26): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w, h);
  s.quadraticCurveTo(0, h * 1.08, w, h);
  s.bezierCurveTo(w * 0.96, h * 0.1, w * 0.5, -h * 0.65, 0, -h);
  s.bezierCurveTo(-w * 0.5, -h * 0.65, -w * 0.96, h * 0.1, -w, h);
  return s;
}

export function createCoinShape(radius = 0.2): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.moveTo(-radius * 0.24, -radius * 0.24);
  hole.lineTo(radius * 0.24, -radius * 0.24);
  hole.lineTo(radius * 0.24, radius * 0.24);
  hole.lineTo(-radius * 0.24, radius * 0.24);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

export function createKeyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0.22, 0.1, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0.22, 0.045, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

export function createScrollShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.18, -0.18);
  s.quadraticCurveTo(-0.22, 0.0, -0.17, 0.18);
  s.lineTo(0.18, 0.20);
  s.quadraticCurveTo(0.22, 0.02, 0.17, -0.19);
  s.closePath();
  return s;
}

export function createGemShape(w = 0.18, h = 0.28): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, h);
  s.lineTo(w, 0.04);
  s.lineTo(w * 0.56, -h);
  s.lineTo(-w * 0.56, -h);
  s.lineTo(-w, 0.04);
  s.closePath();
  return s;
}
