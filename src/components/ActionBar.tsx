import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createEntityOutlineMaterial,
  createEntityShaderMaterial,
} from '../game/core/EntityShader';
import { computeActorHighlightHex, computeActorShadowHex, PALETTE_ACTOR } from '../game/core/PaletteActor';
import {
  createSnapshotCanvasFromScene,
  subscribeSharedWebGLRenderer,
} from '../game/OffscreenSnapshotRenderer';
import { HudSnapshot, INVENTORY_CAPACITY } from '../game/types';

interface ActionBarProps {
  hud: HudSnapshot;
  inventoryOpen: boolean;
  onToggleInventory: () => void;
  // Hooks reservados para futura implementación de slots en la barra inferior
  onUseConsumable?: (itemId: string) => void;
  onTriggerSkill?: (slotIndex: 0 | 1 | 2) => void;
}

export const ActionBar: React.FC<ActionBarProps> = React.memo(({
  hud,
  inventoryOpen,
  onToggleInventory,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotsRef = useRef<{ closed: HTMLCanvasElement; open: HTMLCanvasElement } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [popping, setPopping] = useState(false);
  const popTimerRef = useRef<number | null>(null);

  const drawSnapshot = useCallback((isOpen: boolean) => {
    const canvas = canvasRef.current;
    const snaps = snapshotsRef.current;
    if (!canvas || !snaps) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(isOpen ? snaps.open : snaps.closed, 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const buildSnapshots = () => {
      if (cancelled || snapshotsRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
      camera.position.set(0.92, 0.72, 2.35);
      camera.lookAt(0, 0.02, 0);

      const lightDir = new THREE.Vector3(0.58, 0.82, 0.42).normalize();
      const ambientTint = new THREE.Color(0xfff4e0);

      const geos: THREE.BufferGeometry[] = [];
      const mats: THREE.Material[] = [];

      const makeBodyMat = (baseHex: number, opts?: { shadow?: number; highlight?: number; rim?: number }) => {
        const mat = createEntityShaderMaterial({
          baseColor: baseHex,
          shadowColor: opts?.shadow ?? computeActorShadowHex(baseHex, 0.6),
          highlightColor: opts?.highlight ?? computeActorHighlightHex(baseHex, 0.18),
          rimStrength: opts?.rim ?? 0.4,
          sharedLightDir: lightDir,
          sharedAmbientTint: ambientTint,
        });
        mats.push(mat);
        return mat;
      };

      const outlineMat = createEntityOutlineMaterial(0.028, 1.0, PALETTE_ACTOR.OUTLINE_BLACK);
      mats.push(outlineMat);

      const makeExtrudedPart = (
        shape: THREE.Shape,
        depth: number,
        baseHex: number,
        bevel = 0.032,
        withOutline = true,
        rim = 0.4
      ): THREE.Group => {
        const faceGeo = new THREE.ShapeGeometry(shape, 14);
        faceGeo.translate(0, 0, depth * 0.5 + 0.002);
        geos.push(faceGeo);

        const volGeo = new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel * 0.85,
          bevelSegments: 2,
          curveSegments: 14,
        });
        volGeo.translate(0, 0, -depth * 0.5);
        volGeo.computeVertexNormals();
        geos.push(volGeo);

        const mat = makeBodyMat(baseHex, { rim });
        const group = new THREE.Group();
        group.add(new THREE.Mesh(volGeo, mat));

        const faceMat = mat.clone();
        faceMat.polygonOffset = true;
        faceMat.polygonOffsetFactor = -1;
        faceMat.polygonOffsetUnits = -1;
        mats.push(faceMat);
        group.add(new THREE.Mesh(faceGeo, faceMat));

        if (withOutline) {
          group.add(new THREE.Mesh(volGeo, outlineMat));
        }
        return group;
      };

      const makeDetailShape = (shape: THREE.Shape, baseHex: number, zPos: number): THREE.Mesh => {
        const geo = new THREE.ShapeGeometry(shape, 10);
        geo.translate(0, 0, zPos);
        geos.push(geo);
        const mat = makeBodyMat(baseHex, { rim: 0.15 });
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -2;
        mat.polygonOffsetUnits = -2;
        return new THREE.Mesh(geo, mat);
      };

      const backpackRoot = new THREE.Group();
      backpackRoot.rotation.y = -0.18;
      scene.add(backpackRoot);

      // 1. Cuerpo principal
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(-0.36, -0.38);
      bodyShape.bezierCurveTo(-0.46, -0.36, -0.49, 0.04, -0.38, 0.34);
      bodyShape.bezierCurveTo(-0.28, 0.50, 0.28, 0.50, 0.38, 0.34);
      bodyShape.bezierCurveTo(0.49, 0.04, 0.46, -0.36, 0.36, -0.38);
      bodyShape.bezierCurveTo(0.16, -0.46, -0.16, -0.46, -0.36, -0.38);
      backpackRoot.add(makeExtrudedPart(bodyShape, 0.34, PALETTE_ACTOR.FUR_BROWN, 0.042, true, 0.42));

      // 2. Correas laterales
      for (const side of [-1, 1] as const) {
        const strapShape = new THREE.Shape();
        strapShape.moveTo(side * 0.16, 0.44);
        strapShape.bezierCurveTo(side * 0.36, 0.46, side * 0.50, 0.18, side * 0.48, -0.18);
        strapShape.bezierCurveTo(side * 0.47, -0.30, side * 0.40, -0.35, side * 0.34, -0.31);
        strapShape.bezierCurveTo(side * 0.39, -0.16, side * 0.40, 0.14, side * 0.24, 0.34);
        strapShape.lineTo(side * 0.12, 0.36);
        strapShape.closePath();

        const strapPart = makeExtrudedPart(strapShape, 0.14, PALETTE_ACTOR.LEATHER_DARK, 0.018, true, 0.26);
        strapPart.position.z = -0.13;
        backpackRoot.add(strapPart);
      }

      // Asa superior
      const handleShape = new THREE.Shape();
      handleShape.moveTo(-0.11, 0.44);
      handleShape.bezierCurveTo(-0.11, 0.59, 0.11, 0.59, 0.11, 0.44);
      handleShape.lineTo(0.06, 0.44);
      handleShape.bezierCurveTo(0.06, 0.52, -0.06, 0.52, -0.06, 0.44);
      handleShape.closePath();
      const handlePart = makeExtrudedPart(handleShape, 0.08, PALETTE_ACTOR.LEATHER_DARK, 0.014, true, 0.3);
      handlePart.position.z = -0.04;
      backpackRoot.add(handlePart);

      // 3. Bolsillo frontal
      const pocketShape = new THREE.Shape();
      pocketShape.moveTo(-0.24, -0.32);
      pocketShape.bezierCurveTo(-0.29, -0.28, -0.28, -0.06, -0.21, -0.03);
      pocketShape.bezierCurveTo(-0.08, 0.01, 0.08, 0.01, 0.21, -0.03);
      pocketShape.bezierCurveTo(0.28, -0.06, 0.29, -0.28, 0.24, -0.32);
      pocketShape.bezierCurveTo(0.10, -0.38, -0.10, -0.38, -0.24, -0.32);
      const pocketPart = makeExtrudedPart(pocketShape, 0.14, PALETTE_ACTOR.TUNIC_GOLD, 0.025, true, 0.44);
      pocketPart.position.z = 0.21;
      backpackRoot.add(pocketPart);

      const zipShape = new THREE.Shape();
      zipShape.moveTo(-0.18, -0.11);
      zipShape.lineTo(0.18, -0.11);
      zipShape.lineTo(0.18, -0.14);
      zipShape.lineTo(-0.18, -0.14);
      zipShape.closePath();
      backpackRoot.add(makeDetailShape(zipShape, PALETTE_ACTOR.LEATHER_DARK, 0.315));

      const zipPullShape = new THREE.Shape();
      zipPullShape.moveTo(0.02, -0.12);
      zipPullShape.lineTo(0.06, -0.12);
      zipPullShape.lineTo(0.05, -0.19);
      zipPullShape.lineTo(0.03, -0.19);
      zipPullShape.closePath();
      backpackRoot.add(makeDetailShape(zipPullShape, PALETTE_ACTOR.ORO, 0.32));

      // 4. Solapa superior
      const flapPivot = new THREE.Group();
      flapPivot.position.set(0, 0.42, -0.04);
      backpackRoot.add(flapPivot);

      const flapShape = new THREE.Shape();
      flapShape.moveTo(-0.34, 0.04);
      flapShape.bezierCurveTo(-0.16, 0.10, 0.16, 0.10, 0.34, 0.04);
      flapShape.lineTo(0.41, -0.26);
      flapShape.bezierCurveTo(0.20, -0.35, -0.20, -0.35, -0.41, -0.26);
      flapShape.closePath();
      const flapPart = makeExtrudedPart(flapShape, 0.18, 0xb86d32, 0.028, true, 0.48);
      flapPart.position.set(0, -0.02, 0.19);
      flapPivot.add(flapPart);

      const creaseShape = new THREE.Shape();
      creaseShape.moveTo(-0.018, -0.03);
      creaseShape.lineTo(0.018, -0.03);
      creaseShape.lineTo(0.015, -0.22);
      creaseShape.lineTo(-0.015, -0.22);
      creaseShape.closePath();
      flapPivot.add(makeDetailShape(creaseShape, PALETTE_ACTOR.LEATHER_DARK, 0.318));

      const buckleShape = new THREE.Shape();
      buckleShape.moveTo(-0.085, -0.17);
      buckleShape.bezierCurveTo(-0.095, -0.17, -0.095, -0.31, -0.085, -0.31);
      buckleShape.lineTo(0.085, -0.31);
      buckleShape.bezierCurveTo(0.095, -0.31, 0.095, -0.17, 0.085, -0.17);
      buckleShape.closePath();
      const bucklePart = makeExtrudedPart(buckleShape, 0.06, PALETTE_ACTOR.ORO, 0.016, true, 0.58);
      bucklePart.position.set(0, 0, 0.31);
      flapPivot.add(bucklePart);

      const bucklePinShape = new THREE.Shape();
      bucklePinShape.moveTo(-0.035, -0.215);
      bucklePinShape.lineTo(0.035, -0.215);
      bucklePinShape.lineTo(0.035, -0.265);
      bucklePinShape.lineTo(-0.035, -0.265);
      bucklePinShape.closePath();
      flapPivot.add(makeDetailShape(bucklePinShape, PALETTE_ACTOR.LEATHER_DARK, 0.362));

      try {
        flapPivot.rotation.x = 0;
        const closedSnap = createSnapshotCanvasFromScene(scene, camera, 80);
        flapPivot.rotation.x = -0.28;
        const openSnap = createSnapshotCanvasFromScene(scene, camera, 80);
        if (closedSnap && openSnap && !cancelled) {
          snapshotsRef.current = { closed: closedSnap, open: openSnap };
          drawSnapshot(inventoryOpen);
        }
      } finally {
        for (let i = 0; i < geos.length; i++) geos[i].dispose();
        for (let i = 0; i < mats.length; i++) mats[i].dispose();
      }
    };

    const unsub = subscribeSharedWebGLRenderer((ready) => {
      if (ready) buildSnapshots();
    });

    return () => {
      cancelled = true;
      unsub();
      if (popTimerRef.current !== null) window.clearTimeout(popTimerRef.current);
    };
  }, [drawSnapshot, inventoryOpen]);

  useEffect(() => {
    drawSnapshot(inventoryOpen);
  }, [inventoryOpen, drawSnapshot]);

  const usedBagSlots = hud.inventorySlots.filter(Boolean).length;

  const handleOpenClick = useCallback(() => {
    setPopping(true);
    if (popTimerRef.current !== null) window.clearTimeout(popTimerRef.current);
    popTimerRef.current = window.setTimeout(() => setPopping(false), 180);
    onToggleInventory();
  }, [onToggleInventory]);

  return (
    <div
      id="bottom-bar"
      className="fixed bottom-[max(10px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[500] flex items-center justify-center pointer-events-none"
    >
      <div
        id="backpack-container"
        role="button"
        tabIndex={0}
        aria-label={`Abrir Mochila (${usedBagSlots}/${INVENTORY_CAPACITY})`}
        title={`Mochila (I) · ${usedBagSlots}/${INVENTORY_CAPACITY}`}
        onClick={handleOpenClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenClick();
          }
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className={`pointer-events-auto cursor-pointer select-none flex items-center justify-center transition-transform duration-150 ${
          popping ? 'scale-110' : hovered ? 'scale-105 brightness-110' : 'scale-100'
        }`}
      >
        <canvas
          id="backpack-canvas"
          ref={canvasRef}
          width={80}
          height={80}
          className="w-[80px] h-[80px] block pointer-events-none"
        />
      </div>
    </div>
  );
});
