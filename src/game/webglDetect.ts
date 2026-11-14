let cachedSoftwareWebGL: boolean | null = null;

/**
 * Detecta WebGL por software (SwiftShader, llvmpipe, etc.) una sola vez por sesión
 * y libera inmediatamente el contexto de prueba para evitar fugas de WebGL.
 */
export function isSoftwareWebGL(): boolean {
  if (cachedSoftwareWebGL !== null) return cachedSoftwareWebGL;
  if (typeof document === 'undefined') {
    cachedSoftwareWebGL = false;
    return cachedSoftwareWebGL;
  }
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
      cachedSoftwareWebGL = true;
      return cachedSoftwareWebGL;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareWebGL = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedSoftwareWebGL;
  } catch {
    cachedSoftwareWebGL = true;
    return cachedSoftwareWebGL;
  }
}
