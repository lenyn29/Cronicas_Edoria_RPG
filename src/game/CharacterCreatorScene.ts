import * as THREE from 'three';
import { DEFAULT_HERO_CONFIG, HeroConfig } from './Constants';
import { createEntityOutlineMaterial, createEntityShaderMaterial } from './core/EntityShader';
import { computeHighlightHex, computeShadowHex, PALETTE_32 } from './core/Palette';
import { EventBus, HeroEventMap } from './EventBus';
import { Hero } from './Hero';
import { isSoftwareWebGL } from './webglDetect';

// Escena 3D dedicada al Creador de Personaje: reutiliza exactamente la clase Hero sobre un pedestal procedural
export class CharacterCreatorScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hero: Hero;
  private readonly heroBus = new EventBus<HeroEventMap>();
  private readonly isSoftwareGl: boolean;
  private readonly clock = new THREE.Clock();

  private readonly pedestalGeo: THREE.BufferGeometry;
  private readonly pedestalMat: THREE.ShaderMaterial;
  private readonly pedestalOutlineMat: THREE.ShaderMaterial;
  private readonly studioLightDir = new THREE.Vector3(0.45, 0.85, 0.4).normalize();
  private readonly studioTint = new THREE.Color(0xfff5e8);

  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private rotationAngle = 0;
  private dragging = false;
  private lastPointerX = 0;
  private dragVelocity = 0;

  private lastW = 0;
  private lastH = 0;

  constructor(container: HTMLElement, initialConfig: HeroConfig = DEFAULT_HERO_CONFIG) {
    this.container = container;
    this.isSoftwareGl = isSoftwareWebGL();

    const w = Math.max(240, container.clientWidth || 420);
    const h = Math.max(240, container.clientHeight || 420);
    this.lastW = w;
    this.lastH = h;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.cursor = 'grab';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 40);
    this.camera.position.set(0, 1.38, 4.15);
    this.camera.lookAt(0, 0.82, 0);

    // Pedestal circular de piedra procedural con ExtrudeGeometry y EntityShader
    const discShape = new THREE.Shape();
    discShape.absarc(0, 0, 0.92, 0, Math.PI * 2, false);
    this.pedestalGeo = new THREE.ExtrudeGeometry(discShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 28,
    });
    this.pedestalGeo.rotateX(Math.PI * 0.5);
    this.pedestalGeo.computeVertexNormals();

    this.pedestalMat = createEntityShaderMaterial({
      baseColor: PALETTE_32.ROCA_OSCURA,
      shadowColor: computeShadowHex(PALETTE_32.ROCA_OSCURA),
      highlightColor: computeHighlightHex(PALETTE_32.ROCA_CLARA),
      rimStrength: 0.36,
      sharedLightDir: this.studioLightDir,
      sharedAmbientTint: this.studioTint,
    });
    this.pedestalOutlineMat = createEntityOutlineMaterial(0.018, 1.0, PALETTE_32.CONTORNO);

    const pedestalMesh = new THREE.Mesh(this.pedestalGeo, this.pedestalMat);
    const pedestalOutline = new THREE.Mesh(this.pedestalGeo, this.pedestalOutlineMat);
    pedestalMesh.position.y = -0.02;
    pedestalOutline.position.y = -0.02;
    this.scene.add(pedestalMesh, pedestalOutline);

    // Instanciar exactamente la misma clase Hero usada en gameplay
    this.hero = new Hero(this.heroBus, initialConfig);
    this.hero.setLightAndTint(this.studioLightDir, this.studioTint);
    this.hero.setZoomOutline(8.8, 11.5);
    this.hero.setWorldPosition(0, 0, 0);
    this.scene.add(this.hero.group);

    this.bindEvents();
    this.tick();
  }

  public setConfig(config: HeroConfig, animatePop = true): void {
    this.hero.applyConfig(config, animatePop);
  }

  public resize = (): void => {
    if (this.disposed) return;
    const w = Math.max(200, this.container.clientWidth || 420);
    const h = Math.max(200, this.container.clientHeight || 420);
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = e.clientX;
    this.dragVelocity = 0;
    this.renderer.domElement.style.cursor = 'grabbing';
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    this.rotationAngle += dx * 0.014;
    this.dragVelocity = dx * 0.014;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.dragging = false;
    this.renderer.domElement.style.cursor = 'grab';
    this.renderer.domElement.releasePointerCapture?.(e.pointerId);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.clock.stop();
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    if (!this.disposed && document.visibilityState !== 'hidden') {
      this.clock.start();
      this.clock.getDelta();
      this.tick();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
      this.clock.stop();
    } else if (!this.disposed && !this.contextLost && !this.renderer.getContext().isContextLost()) {
      this.clock.start();
      this.clock.getDelta();
      this.tick();
    }
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl?.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed || this.contextLost) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed || this.contextLost || document.visibilityState === 'hidden') return;
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.dragging) {
      // Rotación suave automática: 1 vuelta completa cada 8 segundos
      this.rotationAngle += ((Math.PI * 2) / 8) * dt + this.dragVelocity;
      this.dragVelocity *= Math.exp(-8 * dt);
    }

    this.hero.setFacing(Math.sin(this.rotationAngle), Math.cos(this.rotationAngle));
    this.hero.update(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.hero.dispose();
    this.pedestalGeo.dispose();
    this.pedestalMat.dispose();
    this.pedestalOutlineMat.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
