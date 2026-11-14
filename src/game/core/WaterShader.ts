import * as THREE from 'three';
import { GLOBAL_DAY_NIGHT_UNIFORMS } from './GlobalDayNightUniforms';
import { PALETTE_SKY } from './PaletteEnvironment';

export interface WaterShaderUniforms {
  uTime: { value: number };
  uSkyColor?: THREE.Color;
  uLightDir?: THREE.Vector3;
  uFogColor?: THREE.Color;
}

// Shader procedural estilizado para agua unificado con DayNightCycle (sin texturas)
export function createWaterShaderMaterial(opts: WaterShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: opts.uTime,
      uTimeOfDay: GLOBAL_DAY_NIGHT_UNIFORMS.uTimeOfDay,
      uSunDirection: GLOBAL_DAY_NIGHT_UNIFORMS.uSunDirection,
      uAmbientColor: GLOBAL_DAY_NIGHT_UNIFORMS.uAmbientColor,
      uShallowColor: { value: new THREE.Color(0x4ac9d4) },
      uDeepColor: { value: new THREE.Color(0x1a4a8a) },
      uFoamColor: { value: new THREE.Color(0xe6fbff) },
      uSkyColor: { value: (opts.uSkyColor ?? new THREE.Color(PALETTE_SKY.DAY_SKY)).clone() },
      uFogColor: { value: (opts.uFogColor ?? new THREE.Color(PALETTE_SKY.DAY_SKY)).clone() },
      uFogRange: { value: new THREE.Vector2(42.0, 115.0) },
      uLightDir: { value: (opts.uLightDir ?? new THREE.Vector3(0.45, 0.8, 0.35)).clone().normalize() },
    },
    vertexShader: `
      attribute float aWaterDepth;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vDepth;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float d = clamp(aWaterDepth, 0.0, 1.0);
        vDepth = d;

        float ampScale = mix(0.28, 1.0, d);
        float px = wp.x;
        float pz = wp.z;

        float w1 = sin(px * 0.46 + uTime * 2.05) * 0.05;
        float w2 = cos(pz * 0.54 - uTime * 1.65) * 0.03;
        wp.y += (w1 + w2) * ampScale;

        // Derivadas analíticas para normal dinámica de onda
        float dHx = cos(px * 0.46 + uTime * 2.05) * 0.46 * 0.05 * ampScale;
        float dHz = -sin(pz * 0.54 - uTime * 1.65) * 0.54 * 0.03 * ampScale;
        vNormal = normalize(vec3(-dHx, 1.0, -dHz));

        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uTimeOfDay;
      uniform vec3 uSunDirection;
      uniform vec3 uAmbientColor;
      uniform vec3 uShallowColor;
      uniform vec3 uDeepColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSkyColor;
      uniform vec3 uFogColor;
      uniform vec2 uFogRange;
      uniform vec3 uLightDir;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vDepth;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(mix(uLightDir, uSunDirection, 0.85));

        // Micro-ondulación de normal en fragmento para destellos fluidos
        float r1 = sin(vWorldPos.x * 1.55 + uTime * 2.15 + sin(vWorldPos.z * 0.9 - uTime));
        float r2 = cos(vWorldPos.z * 1.70 - uTime * 1.75 + cos(vWorldPos.x * 0.85 + uTime * 0.65));
        float ripple = (r1 + r2) * 0.5;
        N = normalize(N + vec3(r1 * 0.055, 0.0, r2 * 0.055));

        // Color base modulado por luz ambiental del ciclo día/noche
        vec3 baseCol = mix(uShallowColor, uDeepColor, smoothstep(0.06, 0.85, vDepth));
        baseCol += vec3(0.03, 0.06, 0.07) * ripple;
        baseCol *= mix(vec3(1.0), uAmbientColor, 0.72);

        // Reflejo de cielo basado en Fresnel
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(baseCol, uSkyColor, clamp(fresnel * 0.52 + 0.06, 0.0, 0.56));

        // Destello solar (cálido de día) / lunar (frío tenue de noche)
        float dayAmount = smoothstep(0.7, -0.2, cos(uTimeOfDay * 6.2831853));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), mix(24.0, 34.0, dayAmount));
        vec3 specColor = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.96, 0.86), dayAmount);
        col += specColor * spec * mix(0.28, 0.74, dayAmount);

        // Espuma animada en orilla (profundidad baja) + sutiles crestas de ola
        float shoreWave = 0.07 * sin(uTime * 2.6 + (vWorldPos.x + vWorldPos.z) * 0.9);
        float shoreMask = 1.0 - smoothstep(0.04, 0.24 + shoreWave, vDepth);
        float foamNoise = smoothstep(-0.15, 0.55, ripple);
        float shoreFoam = shoreMask * mix(0.45, 0.95, foamNoise);
        float crestFoam = smoothstep(0.76, 0.96, ripple) * 0.34 * vDepth;
        vec3 tintedFoam = uFoamColor * mix(vec3(0.58, 0.68, 0.88), uAmbientColor, 0.65);
        col = mix(col, tintedFoam, clamp(shoreFoam + crestFoam, 0.0, 0.92));

        // Transparencia escalada por profundidad (0.74 en orilla -> 0.90 en zona profunda)
        float alpha = mix(0.74, 0.90, smoothstep(0.0, 0.8, vDepth));
        alpha = max(alpha, shoreFoam * 0.88);

        // Niebla atmosférica a distancia sincronizada con scene.fog
        float dist = length(cameraPosition - vWorldPos);
        float fogFactor = smoothstep(uFogRange.x, uFogRange.y, dist);
        col = mix(col, uFogColor, fogFactor);

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}
