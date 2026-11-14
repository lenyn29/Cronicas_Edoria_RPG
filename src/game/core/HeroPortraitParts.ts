import * as THREE from 'three';
import { HairStyleId } from './Palette';
import { GearStyle } from '../types';

export interface ExtrudedShapeSpec {
  shape: THREE.Shape;
  depth: number;
  zOffset: number;
  bevel: number;
}

export function createHeroEyeShape(): THREE.Shape {
  const eyeShape = new THREE.Shape();
  eyeShape.moveTo(-0.026, 0.0);
  eyeShape.quadraticCurveTo(0.0, 0.026, 0.026, -0.004);
  eyeShape.quadraticCurveTo(0.0, -0.018, -0.026, 0.0);
  return eyeShape;
}

export function createHairShapePieces(style: HairStyleId): ExtrudedShapeSpec[] {
  if (style === 'bald') return [];

  if (style === 'short') {
    const crown = new THREE.Shape();
    crown.moveTo(-0.18, 0.26);
    crown.quadraticCurveTo(-0.20, 0.42, 0.0, 0.45);
    crown.quadraticCurveTo(0.20, 0.42, 0.18, 0.26);
    crown.lineTo(0.10, 0.30);
    crown.lineTo(0.0, 0.27);
    crown.lineTo(-0.10, 0.30);
    crown.closePath();

    const back = new THREE.Shape();
    back.moveTo(-0.17, 0.30);
    back.lineTo(-0.16, 0.14);
    back.quadraticCurveTo(0.0, 0.10, 0.16, 0.14);
    back.lineTo(0.17, 0.30);
    back.closePath();

    return [
      { shape: crown, depth: 0.22, zOffset: 0.0, bevel: 0.75 },
      { shape: back, depth: 0.06, zOffset: -0.09, bevel: 0.55 },
    ];
  }

  if (style === 'long') {
    const crown = new THREE.Shape();
    crown.moveTo(-0.19, 0.25);
    crown.bezierCurveTo(-0.21, 0.43, -0.08, 0.46, 0.0, 0.46);
    crown.bezierCurveTo(0.08, 0.46, 0.21, 0.43, 0.19, 0.25);
    crown.quadraticCurveTo(0.0, 0.31, -0.19, 0.25);

    const longBack = new THREE.Shape();
    longBack.moveTo(-0.20, 0.31);
    longBack.bezierCurveTo(-0.25, 0.08, -0.24, -0.16, -0.17, -0.30);
    longBack.lineTo(-0.06, -0.22);
    longBack.lineTo(0.0, -0.34);
    longBack.lineTo(0.07, -0.22);
    longBack.lineTo(0.17, -0.30);
    longBack.bezierCurveTo(0.24, -0.16, 0.25, 0.08, 0.20, 0.31);
    longBack.closePath();

    const sideLockL = new THREE.Shape();
    sideLockL.moveTo(-0.19, 0.30);
    sideLockL.quadraticCurveTo(-0.23, 0.12, -0.16, -0.06);
    sideLockL.lineTo(-0.11, 0.04);
    sideLockL.lineTo(-0.12, 0.28);
    sideLockL.closePath();

    const sideLockR = new THREE.Shape();
    sideLockR.moveTo(0.19, 0.30);
    sideLockR.quadraticCurveTo(0.23, 0.12, 0.16, -0.06);
    sideLockR.lineTo(0.11, 0.04);
    sideLockR.lineTo(0.12, 0.28);
    sideLockR.closePath();

    return [
      { shape: crown, depth: 0.22, zOffset: 0.0, bevel: 0.8 },
      { shape: longBack, depth: 0.08, zOffset: -0.10, bevel: 0.65 },
      { shape: sideLockL, depth: 0.055, zOffset: 0.08, bevel: 0.45 },
      { shape: sideLockR, depth: 0.055, zOffset: 0.08, bevel: 0.45 },
    ];
  }

  // 'messy' (clásico vagabundo)
  const hairCrown = new THREE.Shape();
  hairCrown.moveTo(-0.20, 0.25);
  hairCrown.lineTo(-0.24, 0.36);
  hairCrown.lineTo(-0.13, 0.39);
  hairCrown.lineTo(-0.08, 0.48);
  hairCrown.lineTo(0.02, 0.43);
  hairCrown.lineTo(0.12, 0.47);
  hairCrown.lineTo(0.18, 0.37);
  hairCrown.lineTo(0.23, 0.32);
  hairCrown.lineTo(0.16, 0.23);
  hairCrown.quadraticCurveTo(0.0, 0.30, -0.20, 0.25);

  const hairBangLeft = new THREE.Shape();
  hairBangLeft.moveTo(-0.19, 0.30);
  hairBangLeft.lineTo(-0.22, 0.13);
  hairBangLeft.lineTo(-0.14, 0.22);
  hairBangLeft.lineTo(-0.09, 0.16);
  hairBangLeft.lineTo(-0.04, 0.29);
  hairBangLeft.closePath();

  const hairBangRight = new THREE.Shape();
  hairBangRight.moveTo(0.03, 0.31);
  hairBangRight.lineTo(0.10, 0.19);
  hairBangRight.lineTo(0.15, 0.26);
  hairBangRight.lineTo(0.22, 0.14);
  hairBangRight.lineTo(0.19, 0.31);
  hairBangRight.closePath();

  const hairBack = new THREE.Shape();
  hairBack.moveTo(-0.19, 0.32);
  hairBack.lineTo(-0.20, 0.04);
  hairBack.lineTo(-0.09, 0.09);
  hairBack.lineTo(0.0, 0.01);
  hairBack.lineTo(0.10, 0.08);
  hairBack.lineTo(0.19, 0.03);
  hairBack.lineTo(0.18, 0.32);
  hairBack.closePath();

  return [
    { shape: hairCrown, depth: 0.22, zOffset: 0.0, bevel: 0.85 },
    { shape: hairBangLeft, depth: 0.06, zOffset: 0.09, bevel: 0.55 },
    { shape: hairBangRight, depth: 0.06, zOffset: 0.09, bevel: 0.55 },
    { shape: hairBack, depth: 0.07, zOffset: -0.09, bevel: 0.65 },
  ];
}

export function createHelmetShapePieces(style: GearStyle): {
  dome: { shape: THREE.Shape; depth: number; bevel: number };
  crest: { shape: THREE.Shape; depth: number; bevel: number } | null;
} {
  const dome = new THREE.Shape();
  dome.moveTo(-0.21, 0.16);
  dome.bezierCurveTo(-0.23, 0.36, -0.10, 0.45, 0.0, 0.46);
  dome.bezierCurveTo(0.10, 0.45, 0.23, 0.36, 0.21, 0.16);
  dome.lineTo(0.15, 0.21);
  dome.lineTo(0.03, 0.24);
  dome.lineTo(0.0, 0.12);
  dome.lineTo(-0.03, 0.24);
  dome.lineTo(-0.15, 0.21);
  dome.closePath();

  let crest: { shape: THREE.Shape; depth: number; bevel: number } | null = null;
  if (style === 'bronze' || style === 'glacial' || style === 'obsidian') {
    const crestShape = new THREE.Shape();
    crestShape.moveTo(-0.04, 0.44);
    crestShape.lineTo(0.0, 0.59);
    crestShape.lineTo(0.06, 0.46);
    crestShape.closePath();
    crest = { shape: crestShape, depth: 0.07, bevel: 0.65 };
  }

  return {
    dome: { shape: dome, depth: 0.23, bevel: 0.9 },
    crest,
  };
}
