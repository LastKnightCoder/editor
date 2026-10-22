/**
 * 正文指纹：纯文本的字符 bigram 集合做 MinHash，估计两版正文的 Jaccard 相似度。
 *
 * AI 元信息据此判断「正文是否大改」：只看文本本身，不依赖向量（远程向量未必最新，换嵌入模型会让判断失效）。
 * 空白与大小写不参与比较；bigram 对中文逐字有效，对英文也能容忍单词内的小改。
 */

import type { Descendant } from "slate";

export const DIGEST_HASHES = 128;
/** 低于此相似度视为大改、需要重算元信息（真实编辑样本校准） */
export const DIGEST_RECOMPUTE_THRESHOLD = 0.7;
const DIGEST_PREFIX = "mh1:";
const HEX_WIDTH = 8;

/** 种子固定：指纹要跨版本、跨机器可比 */
const SEEDS: Uint32Array = (() => {
  const seeds = new Uint32Array(DIGEST_HASHES);
  let state = 0x9e3779b9;
  for (let i = 0; i < DIGEST_HASHES; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    seeds[i] = fmix32(state ^ (i * 0x85ebca6b));
  }
  return seeds;
})();

/** murmur3 的 finalizer：32 位雪崩混合 */
function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 正文按顶层块取纯文本（代码块读 code 属性），去掉空块；第一块即卡片的「开头」 */
export function contentBlockLines(content: Descendant[] | unknown): string[] {
  const text = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: unknown; code?: unknown; children?: unknown };
    if (typeof n.text === "string") return n.text;
    if (typeof n.code === "string") return n.code;
    return Array.isArray(n.children) ? n.children.map(text).join("") : "";
  };
  return Array.isArray(content) ? content.map(node => text(node).trim()).filter(Boolean) : [];
}

/** 正文纯文本，块之间换行 */
export function contentPlainText(content: Descendant[] | null | undefined): string {
  return contentBlockLines(content).join("\n");
}

function shingles(text: string): Set<number> {
  const chars = Array.from(text.toLowerCase().replace(/\s+/g, ""));
  const result = new Set<number>();
  if (chars.length === 1) result.add(hashString(chars[0]));
  for (let i = 0; i + 1 < chars.length; i++) result.add(hashString(chars[i] + chars[i + 1]));
  return result;
}

/** FNV-1a（32 位）按 UTF-16 码元 */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 纯文本 → 指纹字符串；空文本得到全满的签名（与任何非空文本相似度为 0） */
export function textDigest(text: string): string {
  const signature = new Uint32Array(DIGEST_HASHES).fill(0xffffffff);
  for (const shingle of shingles(text)) {
    for (let i = 0; i < DIGEST_HASHES; i++) {
      const value = fmix32(shingle ^ SEEDS[i]);
      if (value < signature[i]) signature[i] = value;
    }
  }
  let hex = DIGEST_PREFIX;
  for (const value of signature) hex += value.toString(16).padStart(HEX_WIDTH, "0");
  return hex;
}

function parseDigest(digest: string): Uint32Array | null {
  if (!digest.startsWith(DIGEST_PREFIX)) return null;
  const body = digest.slice(DIGEST_PREFIX.length);
  if (body.length !== DIGEST_HASHES * HEX_WIDTH) return null;
  const signature = new Uint32Array(DIGEST_HASHES);
  for (let i = 0; i < DIGEST_HASHES; i++) {
    const value = Number.parseInt(body.slice(i * HEX_WIDTH, (i + 1) * HEX_WIDTH), 16);
    if (Number.isNaN(value)) return null;
    signature[i] = value;
  }
  return signature;
}

/** 两个指纹的估计 Jaccard 相似度（0–1）；任一无法解析（旧格式、损坏）视为 0，即需要重算 */
export function digestSimilarity(a: string, b: string): number {
  const left = parseDigest(a);
  const right = parseDigest(b);
  if (!left || !right) return 0;
  let same = 0;
  for (let i = 0; i < DIGEST_HASHES; i++) if (left[i] === right[i]) same++;
  return same / DIGEST_HASHES;
}
