import React, { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import * as THREE from 'three';
import { GEAR_SHADER_PALETTES, HERO_DIMENSIONS, HeroConfig } from '../game/Constants';
import { createEntityOutlineMaterial, createEntityShaderMaterial } from '../game/core/EntityShader';
import {
  createHairShapePieces,
  createHelmetShapePieces,
  createHeroEyeShape,
} from '../game/core/HeroPortraitParts';
import {
  HAIR_COLOR_SWATCHES,
  PALETTE_32,
  SKIN_TONE_SWATCHES,
} from '../game/core/Palette';
import { createHeadSilhouette } from '../game/core/ShapeLibrary';
import {
  renderMiniSceneToCanvas2D,
  subscribeSharedWebGLRenderer,
} from '../game/OffscreenSnapshotRenderer';
import { GearStyle } from '../game/types';

interface HeroPortraitCanvasProps {
  config: HeroConfig;
  helmetStyle?: GearStyle | null;
  size?: number;
  id?: string;
  className?: string;
}

export const HeroPortraitCanvas: React.FC<HeroPortraitCanvasProps> = React.memo(({
  config,
  helmetStyle = null,
  size = 56,
  id,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendererReady, setRendererReady] = useState(false);

  useEffect(() => {
    return subscribeSharedWebGLRenderer(setRendererReady);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rendererReady) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
    camera.position.set(0, 0.22, 1.18);
    camera.lookAt(0, 0.21, 0);

    const root = new THREE.Group();
    scene.add(root);

    const lightDir = new THREE.Vector3(0.35, 0.65, 0.75).normalize();
    const ambientTint = new THREE.Color(0xfff8ec);
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const addPart = (
      shape: THREE.Shape,
      depth: number,
      baseHex: number,
      shadowHex: number,
      highlightHex: number,
      withOutline: boolean,
      bevelScale: number
    ): THREE.Group => {
      const bevel = Math.min(0.025, depth * 0.22) * bevelScale;
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: bevel > 0.002,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 10,
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.computeVertexNormals();
      geos.push(geo);

      const mat = createEntityShaderMaterial({
        baseColor: baseHex,
        shadowColor: shadowHex,
        highlightColor: highlightHex,
        rimStrength: 0.34,
        sharedLightDir: lightDir,
        sharedAmbientTint: ambientTint,
      });
      mats.push(mat);

      const group = new THREE.Group();
      group.add(new THREE.Mesh(geo, mat));

      if (withOutline) {
        const outlineMat = createEntityOutlineMaterial(0.015, 1.0, PALETTE_32.CONTORNO);
        mats.push(outlineMat);
        group.add(new THREE.Mesh(geo, outlineMat));
      }

      return group;
    };

    try {
      const skin = SKIN_TONE_SWATCHES[config.skinTone];
      const hair = HAIR_COLOR_SWATCHES[config.hairColor];

      const headShape = createHeadSilhouette(config.gender);
      root.add(
        addPart(headShape, HERO_DIMENSIONS.HEAD_DEPTH, skin.base, skin.shadow, skin.highlight, true, 1.0)
      );

      const eyeShape = createHeroEyeShape();
      for (const side of [-1, 1]) {
        const eyePart = addPart(
          eyeShape,
          0.018,
          PALETTE_32.CONTORNO,
          PALETTE_32.CONTORNO,
          PALETTE_32.CONTORNO,
          false,
          0.2
        );
        eyePart.position.set(side * 0.072, 0.18 + (side > 0 ? -0.01 : 0), 0.11);
        root.add(eyePart);
      }

      if (helmetStyle) {
        const pal = GEAR_SHADER_PALETTES[helmetStyle];
        const { dome, crest } = createHelmetShapePieces(helmetStyle);
        root.add(addPart(dome.shape, dome.depth, pal.base, pal.shadow, pal.base, true, dome.bevel));
        if (crest) {
          root.add(addPart(crest.shape, crest.depth, pal.trim, pal.trimShadow, pal.trim, true, crest.bevel));
        }
      } else {
        const hairPieces = createHairShapePieces(config.hairStyle);
        for (const piece of hairPieces) {
          const hairPart = addPart(
            piece.shape,
            piece.depth,
            hair.base,
            hair.shadow,
            hair.highlight,
            true,
            piece.bevel
          );
          hairPart.position.set(0, 0, piece.zOffset);
          root.add(hairPart);
        }
      }

      root.rotation.y = 0.08;
      renderMiniSceneToCanvas2D(scene, camera, canvas, Math.min(128, Math.max(56, size * 2)));
    } finally {
      for (let i = 0; i < geos.length; i++) geos[i].dispose();
      for (let i = 0; i < mats.length; i++) mats[i].dispose();
    }
  }, [config, helmetStyle, size, rendererReady]);

  if (!rendererReady) {
    return (
      <div
        id={id}
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-[#1e2230] border border-[#555555] text-[#c9a227] shrink-0 ${className}`}
      >
        <User className="w-6 h-6" />
      </div>
    );
  }

  return (
    <canvas
      id={id}
      ref={canvasRef}
      width={Math.min(128, Math.max(56, size * 2))}
      height={Math.min(128, Math.max(56, size * 2))}
      style={{ width: size, height: size }}
      className={`block shrink-0 bg-[#181b26] border border-[#555555] ${className}`}
    />
  );
});
