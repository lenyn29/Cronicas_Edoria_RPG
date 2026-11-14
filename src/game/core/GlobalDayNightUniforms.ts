import * as THREE from 'three';

// Uniforms globales compartidos entre DayNightCycle y todos los shaders procedurales (cero duplicación)
export const GLOBAL_DAY_NIGHT_UNIFORMS = {
  uTimeOfDay: { value: 0.25 }, // Normalizado 0..1 (0 = medianoche, 0.5 = mediodía)
  uSunDirection: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
  uAmbientColor: { value: new THREE.Color(0xffffff) },
};
