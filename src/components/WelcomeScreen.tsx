import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createEntityOutlineMaterial, createEntityShaderMaterial } from '../game/core/EntityShader';
import { PALETTE_32 } from '../game/core/Palette';
import { PALETTE_ACTOR } from '../game/core/PaletteActor';
import { PALETTE_ENVIRONMENT, PALETTE_SKY } from '../game/core/PaletteEnvironment';
import {
  createCrystalShape,
  createLeafShape,
  createRockPolygonShape,
  createTrunkShape,
} from '../game/core/ShapeLibrary';

import { isSoftwareWebGL } from '../game/webglDetect';

interface WelcomeScreenProps {
  onBegin: () => Promise<void> | void;
}

function toCssHex(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const ACCENT_GREEN = toCssHex(PALETTE_ACTOR.HERO_GREEN);

/**
 * Pantalla de bienvenida (WELCOME) con fondo ligero procedural de la silueta del continente de Vael
 * sin cargar chunks ni el mundo completo.
 */
export function WelcomeScreen({ onBegin }: WelcomeScreenProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const isSoftwareGl = isSoftwareWebGL();
    const w = Math.max(320, host.clientWidth || window.innerWidth);
    const h = Math.max(240, host.clientHeight || window.innerHeight);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE_SKY.DAY_SKY);
    scene.fog = new THREE.Fog(PALETTE_SKY.DAY_SKY, 18, 46);

    const camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 120);
    camera.position.set(0, 4.2, 14.5);
    camera.lookAt(0, 1.1, 0);

    const lightDir = new THREE.Vector3(0.5, 0.85, 0.4).normalize();
    const ambientTint = new THREE.Color(0xfff4df);

    const disposablesGeo: THREE.BufferGeometry[] = [];
    const disposablesMat: THREE.Material[] = [];
    const outlineMat = createEntityOutlineMaterial(0.028, 1.0, PALETTE_ACTOR.OUTLINE_BLACK);
    disposablesMat.push(outlineMat);

    const addShapeMesh = (
      parent: THREE.Object3D,
      shape: THREE.Shape,
      depth: number,
      baseColor: number,
      shadowColor: number,
      highlightColor: number,
      x: number,
      y: number,
      z: number,
      rotY = 0,
      scale = 1
    ) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
        curveSegments: 8,
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.computeVertexNormals();
      const mat = createEntityShaderMaterial({
        baseColor,
        shadowColor,
        highlightColor,
        rimStrength: 0.34,
        sharedLightDir: lightDir,
        sharedAmbientTint: ambientTint,
      });
      disposablesGeo.push(geo);
      disposablesMat.push(mat);

      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.y = rotY;
      group.scale.setScalar(scale);
      group.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, outlineMat));
      parent.add(group);
      return group;
    };

    const continentGroup = new THREE.Group();
    scene.add(continentGroup);

    const oceanGeo = new THREE.CircleGeometry(36, 48);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = new THREE.MeshBasicMaterial({ color: PALETTE_32.AGUA_CLARA });
    disposablesGeo.push(oceanGeo);
    disposablesMat.push(oceanMat);
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.y = -0.55;
    scene.add(oceanMesh);

    const mainMass = createRockPolygonShape(5.2, 2.2, 3.1);
    const mainMesh = addShapeMesh(
      continentGroup,
      mainMass,
      3.8,
      PALETTE_ENVIRONMENT.GRASS_BASE,
      PALETTE_ENVIRONMENT.GRASS_SHADOW,
      PALETTE_ENVIRONMENT.GRASS_HIGHLIGHT,
      0,
      -0.2,
      0,
      0,
      1
    );
    mainMesh.rotation.x = Math.PI * 0.5;

    const peakConfigs: Array<[number, number, number, number, number, number]> = [
      [-3.4, 0.3, -1.4, 1.4, 2.1, 0.35],
      [3.1, 0.25, -1.2, 1.25, 1.9, -0.4],
      [-1.5, 0.45, -2.3, 1.8, 2.7, 0.15],
      [1.7, 0.4, -2.1, 1.5, 2.3, -0.25],
      [0.0, 0.65, -2.9, 2.2, 3.2, 0.05],
    ];
    peakConfigs.forEach(([px, py, pz, rx, ry, rot], idx) => {
      addShapeMesh(
        continentGroup,
        createRockPolygonShape(rx, ry, idx + 4.2),
        1.1,
        idx === 4 ? PALETTE_ENVIRONMENT.ROCKY_GROUND : PALETTE_ENVIRONMENT.ROCKY_STONE,
        PALETTE_ENVIRONMENT.ROCKY_STONE,
        PALETTE_ENVIRONMENT.SNOW_GROUND,
        px,
        py,
        pz,
        rot,
        1
      );
    });

    const treeOffsets: Array<[number, number, number, number]> = [
      [-2.8, 0.1, 1.1, 0.9],
      [-1.9, 0.15, 0.7, 1.1],
      [2.2, 0.12, 1.0, 1.0],
      [3.3, 0.08, 0.6, 0.85],
    ];
    for (const [tx, ty, tz, sc] of treeOffsets) {
      addShapeMesh(
        continentGroup,
        createTrunkShape(0.14, 0.08, 0.85),
        0.22,
        PALETTE_ENVIRONMENT.TRUNK_BASE,
        PALETTE_ENVIRONMENT.TRUNK_SHADOW,
        PALETTE_ENVIRONMENT.TRUNK_BASE,
        tx,
        ty,
        tz,
        0,
        sc
      );
      addShapeMesh(
        continentGroup,
        createLeafShape(0.52, 0.95),
        0.48,
        PALETTE_ENVIRONMENT.TREE_BASE,
        PALETTE_ENVIRONMENT.TREE_SHADOW,
        PALETTE_ENVIRONMENT.TREE_HIGHLIGHT,
        tx,
        ty + 0.62 * sc,
        tz,
        0.2,
        sc
      );
    }

    const shrineCrystal = addShapeMesh(
      continentGroup,
      createCrystalShape(0.32, 0.98),
      0.34,
      PALETTE_ACTOR.MAGIC_SKY,
      PALETTE_ACTOR.TUNIC_BLUE,
      PALETTE_ACTOR.WARM_WHITE,
      0,
      1.35,
      -0.8,
      0.2,
      1.15
    );

    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;
    let contextLost = false;

    const handleResize = () => {
      if (disposed) return;
      const rw = Math.max(240, host.clientWidth || window.innerWidth);
      const rh = Math.max(180, host.clientHeight || window.innerHeight);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh, false);
    };
    window.addEventListener('resize', handleResize);

    const renderLoop = () => {
      if (disposed || contextLost || document.visibilityState === 'hidden') return;
      const t = clock.getElapsedTime();
      continentGroup.rotation.y = Math.sin(t * 0.16) * 0.14;
      shrineCrystal.position.y = 1.35 + Math.sin(t * 1.8) * 0.1;
      shrineCrystal.rotation.y = t * 0.65;
      renderer.render(scene, camera);

      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(renderLoop);
      }
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(rafId);
      clock.stop();
    };
    const onRestored = () => {
      contextLost = false;
      if (!disposed && document.visibilityState !== 'hidden') {
        clock.start();
        renderLoop();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(rafId);
        clock.stop();
      } else if (!disposed && !contextLost && !renderer.getContext().isContextLost()) {
        clock.start();
        renderLoop();
      }
    };

    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    renderLoop();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      disposablesGeo.forEach((g) => g.dispose());
      disposablesMat.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleStartClick = async () => {
    if (entering) return;
    setEntering(true);
    try {
      await onBegin();
    } finally {
      setEntering(false);
    }
  };

  return (
    <main
      aria-label="Pantalla de bienvenida de Crónicas de Eldoria"
      className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden"
    >
      <div ref={canvasHostRef} className="fixed inset-0 w-full h-full z-0" aria-hidden="true" />

      <div
        aria-hidden="true"
        className="fixed inset-0 z-10 bg-black/55"
      />

      <section className="relative z-20 rpg-panel max-w-2xl w-[92%] mx-auto text-center px-6 py-8 sm:px-10 sm:py-10">
        <div
          className="inline-block px-3 py-1 mb-3 text-[11px] font-bold uppercase tracking-[0.22em] border"
          style={{
            color: '#e0e0e0',
            borderColor: ACCENT_GREEN,
            backgroundColor: '#1a1a1a',
          }}
        >
          Continente de Vael · Eldoria
        </div>

        <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-wide leading-tight mb-5 text-[#c9a227]">
          Crónicas de Eldoria
        </h1>

        <p className="text-sm sm:text-base leading-relaxed max-w-xl mx-auto mb-7 text-[#e0e0e0]">
          El continente de Vael ha caído en la penumbra. Los biomas se corrompen y las criaturas que
          antes eran pacíficas ahora acechan los caminos. Eres un vagabundo sin nombre, sin armas ni
          recuerdos. Pero en tus manos vacías hay algo que el mundo olvidó: la capacidad de elegir
          quién serás.
        </p>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={entering}
            onClick={handleStartClick}
            className="rpg-btn-primary px-12 py-3.5 font-display text-lg sm:text-xl font-extrabold tracking-wider cursor-pointer disabled:opacity-60"
          >
            {entering ? 'Preparando aventura...' : 'Comenzar'}
          </button>

          <span className="text-[11px] text-[#a0a0a0]">
            Presiona C para ver tu personaje · I para mochila · Esc para pausa
          </span>
        </div>
      </section>
    </main>
  );
}
