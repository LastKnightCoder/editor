export const MAIN_CHUNK_VERSION = 1;

export const mainEmbeddingFingerprint = (embeddingFingerprint: string) =>
  JSON.stringify({ embedding: embeddingFingerprint, mainChunkVersion: MAIN_CHUNK_VERSION });

export function needsMainChunkUpgrade(fingerprint: string | null): boolean {
  try {
    return JSON.parse(fingerprint ?? "null")?.mainChunkVersion !== MAIN_CHUNK_VERSION;
  } catch {
    return true;
  }
}
