/**
 * 本地嵌入的输入整形与向量合并（纯函数，不依赖 electron / node-llama-cpp）。
 *
 * 为什么需要：node-llama-cpp 对 ugm 词表（bge-m3 这类 SentencePiece / T5 风格分词器）不在开头补 <s>，
 * 而 bge-m3 用 CLS 池化取的正是 <s> 的输出——缺了它，取到的是正文第一个字，长文本的向量会塌成一团。
 * 另外这个 GGUF 在 llama.cpp 上超过约 512 token 的输入仍会退化，所以长输入按窗口分别嵌入后取平均。
 * 真实库评估（用卡片 tag 当参照的主题纯度）：修复前 0.420，修复后 0.671，原 Python 版 0.648。
 */

/** 每个窗口的正文 token 数，加上 <s> 与 </s> 后不超过 512 */
export const EMBED_WINDOW_TOKENS = 480;

/** 正文 token 切成若干窗口，每个窗口开头补上 bos（bos 为 null 时不补） */
export function toEmbeddingWindows<T>(
  tokens: readonly T[],
  bos: T | null,
  size = EMBED_WINDOW_TOKENS
): T[][] {
  const windows: T[][] = [];
  for (let start = 0; start < tokens.length; start += size) {
    const window = tokens.slice(start, start + size);
    windows.push(bos !== null && window[0] !== bos ? [bos, ...window] : window);
  }
  return windows;
}

/** 各窗口向量先归一化再平均，结果再归一化（窗口长短不同，不该让某一段的模长主导） */
export function averageNormalized(vectors: ArrayLike<number>[]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Float64Array(dim);
  for (const vector of vectors) {
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) sum[i] += vector[i] / norm;
  }
  let total = 0;
  for (let i = 0; i < dim; i++) total += sum[i] * sum[i];
  total = Math.sqrt(total) || 1;
  return Array.from(sum, value => value / total);
}
