/** 正文切块按保存契约序列化，版本参与已有索引重建指纹。 */
export const MAIN_CHUNK_VERSION = 4;
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
