/** 切块规则变化即加一：并入嵌入指纹整表重建；2 = 卡片 / 摘录超长时切块、节位置按 update_time 分版本存 */
export const MAIN_CHUNK_VERSION = 2;
export const MAIN_CHUNK_BUILD_KEY = "main_content_building_fingerprint";

export const mainEmbeddingFingerprint = (embeddingFingerprint: string) =>
  JSON.stringify({ embedding: embeddingFingerprint, mainChunkVersion: MAIN_CHUNK_VERSION });

export function needsMainChunkUpgrade(fingerprint: string | null): boolean {
  try {
    return JSON.parse(fingerprint ?? "null")?.mainChunkVersion !== MAIN_CHUNK_VERSION;
  } catch {
    return true;
  }
}
