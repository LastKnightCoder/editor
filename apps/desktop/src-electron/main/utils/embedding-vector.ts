export const toFloats = (blob: Buffer) =>
  new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 多条 float32 向量（vec0 原始字节）取 L2 归一化均值；维度不一致的丢弃 */
export function meanVector(blobs: Buffer[]): Buffer | null {
  const vectors = blobs.map(
    blob => new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
  );
  const dim = vectors[0]?.length ?? 0;
  if (!dim) return null;
  const sum = new Float64Array(dim);
  let count = 0;
  for (const vector of vectors) {
    if (vector.length !== dim) continue;
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) sum[i] += vector[i] / norm;
    count++;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += sum[i] * sum[i];
  norm = Math.sqrt(norm);
  if (!count || !norm) return null;
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = sum[i] / norm;
  return Buffer.from(out.buffer);
}
