import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createEntityOutlineMaterial, createEntityShaderMaterial } from '../game/core/EntityShader';
import { computeActorHighlightHex, computeActorShadowHex, PALETTE_ACTOR } from '../game/core/PaletteActor';
import { gameEventBus } from '../game/EventBus';
import {
  createSnapshotCanvasFromScene,
  subscribeSharedWebGLRenderer,
} from '../game/OffscreenSnapshotRenderer';
import { ContextActionType, ContextActionView } from '../game/types';

interface ActionButtonProps {
  visible: boolean;
  onAction: () => void;
}

const DEFAULT_ACTION: ContextActionView = {
  type: 'attack',
  targetId: 'air',
  label: 'Atacar',
  distance: Infinity,
};

export const ActionButton: React.FC<ActionButtonProps> = React.memo(({ visible, onAction }) => {
  const [action, setAction] = useState<ContextActionView>(DEFAULT_ACTION);
  const [pressed, setPressed] = useState(false);
  const [popping, setPopping] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<ContextActionType>('attack');
  const iconSnapsRef = useRef<Record<ContextActionType, HTMLCanvasElement> | null>(null);
  const popTimerRef = useRef<number | null>(null);

  const drawMode = useCallback((m: ContextActionType) => {
    const canvas = canvasRef.current;
    const snaps = iconSnapsRef.current;
    if (!canvas || !snaps) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snaps[m], 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    return gameEventBus.on('context:actionChanged', (next) => {
      const resolved = next ?? DEFAULT_ACTION;
      if (resolved.type !== modeRef.current) {
        modeRef.current = resolved.type;
        drawMode(resolved.type);
        setPopping(true);
        if (popTimerRef.current !== null) window.clearTimeout(popTimerRef.current);
        popTimerRef.current = window.setTimeout(() => setPopping(false), 150);
      }
      setAction(resolved);
    });
  }, [drawMode]);

  useEffect(() => {
    let cancelled = false;
    const buildIcons = () => {
      if (cancelled || iconSnapsRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 16);
      camera.position.set(0.28, 0.24, 2.1);
      camera.lookAt(0, 0, 0);

      const lightDir = new THREE.Vector3(0.45, 0.8, 0.5).normalize();
      const ambientTint = new THREE.Color(0xfff4e0);
      const geos: THREE.BufferGeometry[] = [];
      const mats: THREE.Material[] = [];

      const outlineMat = createEntityOutlineMaterial(0.025, 1.0, PALETTE_ACTOR.OUTLINE_BLACK);
      mats.push(outlineMat);

      const addPart = (
        parent: THREE.Group,
        shape: THREE.Shape,
        depth: number,
        hex: number,
        bevel = 0.024
      ): THREE.Group => {
        const faceGeo = new THREE.ShapeGeometry(shape, 12);
        faceGeo.translate(0, 0, depth * 0.5 + 0.002);
        geos.push(faceGeo);

        const volGeo = new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel * 0.8,
          bevelSegments: 2,
          curveSegments: 12,
        });
        volGeo.translate(0, 0, -depth * 0.5);
        volGeo.computeVertexNormals();
        geos.push(volGeo);

        const mat = createEntityShaderMaterial({
          baseColor: hex,
          shadowColor: computeActorShadowHex(hex, 0.6),
          highlightColor: computeActorHighlightHex(hex, 0.22),
          rimStrength: 0.45,
          sharedLightDir: lightDir,
          sharedAmbientTint: ambientTint,
        });
        mats.push(mat);

        const faceMat = mat.clone();
        faceMat.polygonOffset = true;
        faceMat.polygonOffsetFactor = -1;
        faceMat.polygonOffsetUnits = -1;
        mats.push(faceMat);

        const g = new THREE.Group();
        g.add(new THREE.Mesh(volGeo, mat));
        g.add(new THREE.Mesh(faceGeo, faceMat));
        g.add(new THREE.Mesh(volGeo, outlineMat));
        parent.add(g);
        return g;
      };

      // 1. Espada
      const swordGroup = new THREE.Group();
      swordGroup.rotation.z = -Math.PI * 0.22;
      const blade = new THREE.Shape();
      blade.moveTo(-0.075, -0.14);
      blade.lineTo(-0.085, 0.34);
      blade.lineTo(0, 0.54);
      blade.lineTo(0.085, 0.34);
      blade.lineTo(0.075, -0.14);
      blade.closePath();
      addPart(swordGroup, blade, 0.08, 0xe2e8f0, 0.02);

      const guard = new THREE.Shape();
      guard.moveTo(-0.26, -0.11);
      guard.lineTo(0.26, -0.11);
      guard.lineTo(0.22, -0.19);
      guard.lineTo(-0.22, -0.19);
      guard.closePath();
      addPart(swordGroup, guard, 0.11, 0xc9a227, 0.022);

      const grip = new THREE.Shape();
      grip.moveTo(-0.045, -0.19);
      grip.lineTo(0.045, -0.19);
      grip.lineTo(0.045, -0.39);
      grip.lineTo(-0.045, -0.39);
      grip.closePath();
      addPart(swordGroup, grip, 0.07, PALETTE_ACTOR.FUR_BROWN, 0.015);

      const pommel = new THREE.Shape();
      pommel.absarc(0, -0.44, 0.07, 0, Math.PI * 2, false);
      addPart(swordGroup, pommel, 0.08, 0xc9a227, 0.016);
      scene.add(swordGroup);

      // 2. Diálogo
      const talkGroup = new THREE.Group();
      const bubble = new THREE.Shape();
      bubble.moveTo(-0.34, -0.14);
      bubble.bezierCurveTo(-0.42, -0.14, -0.44, 0.32, -0.28, 0.34);
      bubble.bezierCurveTo(-0.08, 0.38, 0.12, 0.38, 0.28, 0.34);
      bubble.bezierCurveTo(0.44, 0.32, 0.42, -0.14, 0.26, -0.16);
      bubble.lineTo(-0.06, -0.16);
      bubble.lineTo(-0.24, -0.36);
      bubble.lineTo(-0.20, -0.16);
      bubble.closePath();
      addPart(talkGroup, bubble, 0.12, 0xfef3c7, 0.026);

      for (const dx of [-0.16, 0, 0.16]) {
        const dot = new THREE.Shape();
        dot.absarc(dx, 0.10, 0.048, 0, Math.PI * 2, false);
        const dotPart = addPart(talkGroup, dot, 0.05, 0x92400e, 0.01);
        dotPart.position.z = 0.07;
      }
      talkGroup.visible = false;
      scene.add(talkGroup);

      // 3. Mano
      const pickupGroup = new THREE.Group();
      const palm = new THREE.Shape();
      palm.moveTo(-0.19, -0.32);
      palm.bezierCurveTo(-0.25, -0.18, -0.26, 0.06, -0.18, 0.10);
      palm.lineTo(0.18, 0.10);
      palm.bezierCurveTo(0.26, 0.06, 0.25, -0.18, 0.19, -0.32);
      palm.bezierCurveTo(0.08, -0.38, -0.08, -0.38, -0.19, -0.32);
      addPart(pickupGroup, palm, 0.1, 0xf6d3a5, 0.022);

      const fingers: Array<{ x: number; h: number }> = [
        { x: -0.14, h: 0.30 },
        { x: -0.045, h: 0.36 },
        { x: 0.055, h: 0.34 },
        { x: 0.15, h: 0.26 },
      ];
      for (const f of fingers) {
        const fg = new THREE.Shape();
        fg.moveTo(f.x - 0.036, 0.06);
        fg.lineTo(f.x - 0.032, 0.06 + f.h);
        fg.quadraticCurveTo(f.x, 0.11 + f.h, f.x + 0.032, 0.06 + f.h);
        fg.lineTo(f.x + 0.036, 0.06);
        fg.closePath();
        addPart(pickupGroup, fg, 0.085, 0xf6d3a5, 0.014);
      }
      const thumb = new THREE.Shape();
      thumb.moveTo(-0.18, -0.14);
      thumb.lineTo(-0.34, 0.02);
      thumb.quadraticCurveTo(-0.37, 0.07, -0.30, 0.10);
      thumb.lineTo(-0.14, -0.04);
      thumb.closePath();
      addPart(pickupGroup, thumb, 0.085, 0xf6d3a5, 0.014);
      pickupGroup.visible = false;
      scene.add(pickupGroup);

      // 4. Cofre
      const chestGroup = new THREE.Group();
      const chestBox = new THREE.Shape();
      chestBox.moveTo(-0.34, -0.30);
      chestBox.lineTo(0.34, -0.30);
      chestBox.lineTo(0.34, 0.04);
      chestBox.lineTo(-0.34, 0.04);
      chestBox.closePath();
      addPart(chestGroup, chestBox, 0.26, 0x7c4620, 0.022);

      const chestLid = new THREE.Shape();
      chestLid.moveTo(-0.36, 0.03);
      chestLid.lineTo(0.36, 0.03);
      chestLid.bezierCurveTo(0.35, 0.28, -0.35, 0.28, -0.36, 0.03);
      chestLid.closePath();
      addPart(chestGroup, chestLid, 0.28, 0x915428, 0.022);

      for (const sx of [-0.21, 0, 0.21]) {
        const strap = new THREE.Shape();
        strap.moveTo(sx - 0.032, -0.30);
        strap.lineTo(sx + 0.032, -0.30);
        strap.lineTo(sx + 0.032, 0.20);
        strap.lineTo(sx - 0.032, 0.20);
        strap.closePath();
        const sp = addPart(chestGroup, strap, 0.05, 0xc9a227, 0.01);
        sp.position.z = 0.14;
      }

      const lockPlate = new THREE.Shape();
      lockPlate.moveTo(-0.075, -0.09);
      lockPlate.lineTo(0.075, -0.09);
      lockPlate.lineTo(0.075, 0.08);
      lockPlate.lineTo(-0.075, 0.08);
      lockPlate.closePath();
      const lp = addPart(chestGroup, lockPlate, 0.06, 0xc9a227, 0.012);
      lp.position.z = 0.16;
      chestGroup.visible = false;
      scene.add(chestGroup);

      try {
        const snapFor = (m: ContextActionType) => {
          swordGroup.visible = m === 'attack';
          talkGroup.visible = m === 'talk';
          pickupGroup.visible = m === 'pickup';
          chestGroup.visible = m === 'chest';
          return createSnapshotCanvasFromScene(scene, camera, 80);
        };
        const attack = snapFor('attack');
        const talk = snapFor('talk');
        const pickup = snapFor('pickup');
        const chest = snapFor('chest');
        if (attack && talk && pickup && chest && !cancelled) {
          iconSnapsRef.current = { attack, talk, pickup, chest };
          drawMode(modeRef.current);
        }
      } finally {
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
      }
    };

    const unsub = subscribeSharedWebGLRenderer((ready) => {
      if (ready) buildIcons();
    });

    return () => {
      cancelled = true;
      unsub();
      if (popTimerRef.current !== null) window.clearTimeout(popTimerRef.current);
    };
  }, [drawMode]);

  useEffect(() => {
    if (visible) {
      drawMode(modeRef.current);
    }
  }, [visible, drawMode]);

  if (!visible) return null;

  const palette =
    action.type === 'chest'
      ? {
          bg: '#2a2210',
          border: '#c9a227',
          label: 'Abrir cofre',
        }
      : action.type === 'talk'
        ? {
            bg: '#262012',
            border: '#c9a227',
            label: 'Hablar',
          }
        : action.type === 'pickup'
          ? {
              bg: '#13261d',
              border: '#4ade80',
              label: 'Recoger',
            }
          : {
              bg: '#2a1414',
              border: '#c9a227',
              label: 'Atacar',
            };

  const showTargetCaption = action.type !== 'attack' || action.targetId !== 'air';

  return (
    <div className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-[max(20px,env(safe-area-inset-right))] z-[500] flex flex-col items-center gap-1 select-none pointer-events-none">
      {showTargetCaption && (
        <div className="px-2 py-0.5 bg-[#1a1a1a] border border-[#555555] text-[10px] font-bold text-[#e0e0e0] max-w-[144px] truncate">
          {action.label}
        </div>
      )}
      <button
        id="action-button"
        type="button"
        aria-label={`${palette.label}: ${action.label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPressed(true);
          onAction();
        }}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        className={`pointer-events-auto touch-none w-[80px] h-[80px] md:w-[64px] md:h-[64px] rounded-full border-2 text-white flex items-center justify-center cursor-pointer transition-transform duration-150 ${
          pressed ? 'scale-90 brightness-115' : popping ? 'scale-110' : 'scale-100 hover:scale-105'
        }`}
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.border,
        }}
      >
        <canvas
          ref={canvasRef}
          width={80}
          height={80}
          className="w-[46px] h-[46px] md:w-[36px] md:h-[36px] pointer-events-none block"
        />
      </button>
    </div>
  );
});
