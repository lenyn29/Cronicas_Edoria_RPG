import { generateChunkData } from './worldMath';

export interface WorkerChunkRequest {
  cx: number;
  cz: number;
  seed: number;
}

self.onmessage = (e: MessageEvent<WorkerChunkRequest>) => {
  const { cx, cz, seed } = e.data;
  const payload = generateChunkData(cx, cz, seed);

  // Zero-copy transfer of all typed array buffers back to the main thread
  (self as unknown as Worker).postMessage(payload, [
    payload.heights.buffer,
    payload.normals.buffer,
    payload.colors.buffer,
    payload.biomeMap.buffer,
    payload.grassMatrices.buffer,
    payload.grassColors.buffer,
    payload.grassColorVars.buffer,
    payload.propData.buffer,
    payload.colliderData.buffer,
  ]);
};
