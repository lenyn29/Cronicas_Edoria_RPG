import * as THREE from 'three';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './GlobalDayNightUniforms';
import { computeHighlightHex, computeShadowHex, PALETTE_32 } from './Palette';

export const ENTITY_BODY_VERT = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const ENTITY_BODY_FRAG = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uAmbientTint;
  uniform float uTimeOfDay;
  uniform vec3 uSunDirection;
  uniform vec3 uAmbientColor;
  uniform vec3 uBaseColor;
  uniform vec3 uShadowColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uSubsurfaceColor;
  uniform float uSubsurfaceStrength;
  uniform float uRimStrength;
  uniform float uFlashIntensity;
  uniform float uDesaturation;
  uniform float uFogAmount;
  uniform float uTime;
  uniform float uHealthRatio;
  uniform float uDebugSilhouette;
  uniform float uOpacity;
  uniform float uWaveOpacity;
  uniform float uUnlitGlow;

  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;

  void main() {
    float alpha = uOpacity;
    if (uWaveOpacity > 0.01) {
      float wave = 0.72 + 0.28 * sin(vLocalPos.y * 5.0 - uTime * 4.2 + vLocalPos.x * 2.5);
      alpha *= mix(1.0, wave, uWaveOpacity);
    }

    if (uDebugSilhouette > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      return;
    }

    if (uUnlitGlow > 0.5) {
      vec3 glowCol = mix(uBaseColor, uHighlightColor, 0.4 + 0.3 * sin(uTime * 5.0));
      glowCol = mix(glowCol, vec3(1.0), clamp(uFlashIntensity, 0.0, 1.0));
      gl_FragColor = vec4(glowCol, alpha);
      return;
    }

    vec3 N = normalize(vNormalView);
    vec3 L = normalize(mix(uLightDir, uSunDirection, 0.25));
    vec3 V = normalize(vViewPos);

    // Iluminación SNES de 3 bandas nítidas con smoothstep (sombra -> medio -> luz alta)
    float ndl = dot(N, L);
    float shadowToMid = smoothstep(-0.18, -0.02, ndl);
    float midToHigh = smoothstep(0.55, 0.72, ndl);

    vec3 color = mix(uShadowColor, uBaseColor, shadowToMid);
    color = mix(color, uHighlightColor, midToHigh);

    // Translucidez interna (subsurface scattering simulado para slime/cristal)
    if (uSubsurfaceStrength > 0.01) {
      float coreDist = length(vLocalPos.xy);
      float coreMask = smoothstep(0.55, 0.05, coreDist);
      color = mix(color, uSubsurfaceColor, coreMask * uSubsurfaceStrength);
    }

    // Luz de borde (rim light)
    float fresnel = pow(1.0 - abs(dot(N, V)), 2.8);
    color += uHighlightColor * (fresnel * uRimStrength);

    // Tinte ambiental unificado: mezcla suavemente bioma + ciclo día/noche
    vec3 envTint = mix(vec3(1.0), uAmbientTint, 0.22) * mix(vec3(1.0), uAmbientColor, 0.56);
    color *= envTint;

    // Desaturación por estado + ligera desaturación nocturna por uTimeOfDay
    float nightPhase = smoothstep(-0.15, 0.75, cos(uTimeOfDay * 6.2831853));
    float hurtDesat = clamp((0.45 - uHealthRatio) * 0.9, 0.0, 0.38);
    float totalDesat = clamp(uDesaturation + hurtDesat + nightPhase * 0.16, 0.0, 0.88);
    if (totalDesat > 0.001) {
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(luma), totalDesat);
    }

    // Niebla atmosférica para capas lejanas de parallax
    if (uFogAmount > 0.001) {
      color = mix(color, uAmbientTint * uAmbientColor * 0.45, clamp(uFogAmount, 0.0, 0.85));
    }

    // Pulso muy sutil cuando salud < 30%
    if (uHealthRatio < 0.3) {
      float pulse = 0.06 * (0.5 + 0.5 * sin(uTime * 6.0));
      color = mix(color, vec3(0.65, 0.14, 0.14), pulse);
    }

    // Destello de impacto / telegrafiado (uFlashIntensity)
    color = mix(color, vec3(1.0, 0.9, 0.85), clamp(uFlashIntensity, 0.0, 1.0));

    gl_FragColor = vec4(color, alpha);
  }
`;

export const ENTITY_OUTLINE_VERT = /* glsl */ `
  uniform float uOutlineWidth;

  void main() {
    float nLen = length(normal);
    vec3 dir = nLen > 0.0001 ? normal / nLen : vec3(0.0, 1.0, 0.0);
    vec3 expanded = position + dir * uOutlineWidth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
  }
`;

export const ENTITY_OUTLINE_FRAG = /* glsl */ `
  uniform vec3 uOutlineColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uOutlineColor, uOpacity);
  }
`;

export const CONTACT_SHADOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CONTACT_SHADOW_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - vec2(0.5)) * 2.0;
    float falloff = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(0.03, 0.04, 0.06, falloff * uAlpha);
  }
`;

export const ADDITIVE_POINTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (280.0 / max(1.0, -mvPos.z));
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const ADDITIVE_POINTS_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    if (vAlpha <= 0.01) discard;
    vec2 p = gl_PointCoord - vec2(0.5);
    float dist = max(abs(p.x), abs(p.y)) * 2.0;
    float mask = smoothstep(1.0, 0.18, dist);
    gl_FragColor = vec4(vColor, mask * vAlpha);
  }
`;

export interface EntityShaderOptions {
  baseColor: number;
  shadowColor?: number;
  highlightColor?: number;
  subsurfaceColor?: number;
  subsurfaceStrength?: number;
  rimStrength?: number;
  flashIntensity?: number;
  desaturation?: number;
  fogAmount?: number;
  opacity?: number;
  waveOpacity?: number;
  additive?: boolean;
  unlitGlow?: boolean;
  sharedLightDir?: THREE.Vector3;
  sharedAmbientTint?: THREE.Color;
}

export function createEntityShaderMaterial(opts: EntityShaderOptions): THREE.ShaderMaterial {
  const shadow = opts.shadowColor ?? computeShadowHex(opts.baseColor);
  const highlight = opts.highlightColor ?? computeHighlightHex(opts.baseColor);
  const opacity = opts.opacity ?? 1.0;
  const transparent = Boolean(opts.additive || (opts.waveOpacity ?? 0) > 0 || opacity < 0.999);

  return new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: opts.sharedLightDir ?? new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uAmbientTint: { value: opts.sharedAmbientTint ?? new THREE.Color(1, 1, 1) },
      uTimeOfDay: GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay,
      uSunDirection: GLOBAL_DAY_NIGHT_UNIFORMS.uSunDirection,
      uAmbientColor: GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor,
      uBaseColor: { value: new THREE.Color(opts.baseColor) },
      uShadowColor: { value: new THREE.Color(shadow) },
      uHighlightColor: { value: new THREE.Color(highlight) },
      uSubsurfaceColor: { value: new THREE.Color(opts.subsurfaceColor ?? opts.baseColor) },
      uSubsurfaceStrength: { value: opts.subsurfaceStrength ?? 0.0 },
      uRimStrength: { value: opts.rimStrength ?? 0.32 },
      uFlashIntensity: { value: opts.flashIntensity ?? 0.0 },
      uDesaturation: { value: opts.desaturation ?? 0.0 },
      uFogAmount: { value: opts.fogAmount ?? 0.0 },
      uTime: { value: 0.0 },
      uHealthRatio: { value: 1.0 },
      uDebugSilhouette: { value: 0.0 },
      uOpacity: { value: opacity },
      uWaveOpacity: { value: opts.waveOpacity ?? 0.0 },
      uUnlitGlow: { value: opts.unlitGlow ? 1.0 : 0.0 },
    },
    vertexShader: ENTITY_BODY_VERT,
    fragmentShader: ENTITY_BODY_FRAG,
    transparent,
    depthWrite: !transparent,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function createEntityOutlineMaterial(
  outlineWidth = 0.022,
  opacity = 1.0,
  outlineHex: number = PALETTE_32.CONTORNO
): THREE.ShaderMaterial {
  const transparent = opacity < 0.999;
  return new THREE.ShaderMaterial({
    uniforms: {
      uOutlineWidth: { value: outlineWidth },
      uOutlineColor: { value: new THREE.Color(outlineHex) },
      uOpacity: { value: opacity },
    },
    vertexShader: ENTITY_OUTLINE_VERT,
    fragmentShader: ENTITY_OUTLINE_FRAG,
    side: THREE.BackSide,
    transparent,
    depthWrite: !transparent,
  });
}

export function createContactShadowMaterial(alpha = 0.5): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: alpha } },
    vertexShader: CONTACT_SHADOW_VERT,
    fragmentShader: CONTACT_SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

export function createAdditivePointsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ADDITIVE_POINTS_VERT,
    fragmentShader: ADDITIVE_POINTS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
