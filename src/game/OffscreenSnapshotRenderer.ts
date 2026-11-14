import * as THREE from 'three';

type RendererListener = (ready: boolean) => void;

let activeRenderer: THREE.WebGLRenderer | null = null;
let sharedRenderTarget: THREE.WebGLRenderTarget | null = null;
let sharedPixelBuffer: Uint8Array | null = null;
const listeners = new Set<RendererListener>();
const _savedClearColor = new THREE.Color();

export function registerSharedWebGLRenderer(renderer: THREE.WebGLRenderer | null): void {
  if (activeRenderer === renderer) return;
  activeRenderer = renderer;
  if (!renderer && sharedRenderTarget) {
    sharedRenderTarget.dispose();
    sharedRenderTarget = null;
    sharedPixelBuffer = null;
  }
  const ready = isSharedWebGLReady();
  listeners.forEach((cb) => cb(ready));
}

export function isSharedWebGLReady(): boolean {
  if (!activeRenderer) return false;
  try {
    return !activeRenderer.getContext().isContextLost();
  } catch {
    return false;
  }
}

export function subscribeSharedWebGLRenderer(cb: RendererListener): () => void {
  listeners.add(cb);
  cb(isSharedWebGLReady());
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Renderiza una escena procedural miniatura usando el ÚNICO WebGLRenderer activo del juego
 * hacia un WebGLRenderTarget compartido y vuelca el resultado en un <canvas> 2D.
 * Evita abrir múltiples contextos WebGL en el HUD (mochila, botón de acción, retratos).
 */
export function renderMiniSceneToCanvas2D(
  scene: THREE.Scene,
  camera: THREE.Camera,
  targetCanvas: HTMLCanvasElement,
  pixelSize = 80
): boolean {
  const renderer = activeRenderer;
  if (!renderer) return false;
  try {
    if (renderer.getContext().isContextLost()) return false;
  } catch {
    return false;
  }

  const size = Math.max(32, Math.floor(pixelSize));
  if (!sharedRenderTarget || sharedRenderTarget.width !== size || sharedRenderTarget.height !== size) {
    sharedRenderTarget?.dispose();
    sharedRenderTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    sharedPixelBuffer = new Uint8Array(size * size * 4);
  }

  const prevTarget = renderer.getRenderTarget();
  const prevClearAlpha = renderer.getClearAlpha();
  renderer.getClearColor(_savedClearColor);
  const prevToneMapping = renderer.toneMapping;
  const prevShadows = renderer.shadowMap.enabled;
  const prevAutoClear = renderer.autoClear;

  try {
    renderer.setRenderTarget(sharedRenderTarget);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);

    const buf = sharedPixelBuffer!;
    renderer.readRenderTargetPixels(sharedRenderTarget, 0, 0, size, size, buf);

    if (targetCanvas.width !== size) targetCanvas.width = size;
    if (targetCanvas.height !== size) targetCanvas.height = size;
    const ctx2d = targetCanvas.getContext('2d');
    if (!ctx2d) return false;

    const imgData = ctx2d.createImageData(size, size);
    const dst = imgData.data;
    const rowBytes = size * 4;
    // readRenderTargetPixels entrega filas de abajo hacia arriba; invertimos en Y para Canvas 2D
    for (let y = 0; y < size; y++) {
      const srcOffset = (size - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      dst.set(buf.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
    ctx2d.putImageData(imgData, 0, 0);
    return true;
  } catch {
    return false;
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(_savedClearColor, prevClearAlpha);
    renderer.toneMapping = prevToneMapping;
    renderer.shadowMap.enabled = prevShadows;
    renderer.autoClear = prevAutoClear;
  }
}

export function createSnapshotCanvasFromScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  pixelSize = 80
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const off = document.createElement('canvas');
  off.width = pixelSize;
  off.height = pixelSize;
  return renderMiniSceneToCanvas2D(scene, camera, off, pixelSize) ? off : null;
}
