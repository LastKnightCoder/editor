/**
 * 重算阈值校准（KL-054）：MinHash 相似度在真实编辑上的分布。
 *
 * 用法：把若干库备份（含当前库）复制到一个目录，文件名里带 `version-<号>-` 以便排序，然后
 *   KL_DIGEST_EVAL_DIR=/tmp/kl7-digest KL_DIGEST_EVAL_OUT=/tmp/kl7-digest-report.md \
 *     npx vitest run src-electron/main/modules/__tests__/text-digest.eval.test.ts
 *
 * 两类样本：
 * - 人工改写：取最新库里的卡片与长文，按改字、增删句、调换段落、整段改写、改写过半生成编辑对，自带「该不该重算」标签；
 * - 真实编辑：相邻两个备份之间同一 content_id 的正文变化，以及隔一个月左右的累积变化，没有标签，看分布与边界样例。
 * 只读副本，不写库。
 */

import Database from "better-sqlite3";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentPlainText, digestSimilarity, textDigest } from "@/entity/text-digest";

const DIR = process.env.KL_DIGEST_EVAL_DIR;
const OUT = process.env.KL_DIGEST_EVAL_OUT ?? "/tmp/kl7-digest-report.md";
const THRESHOLDS = [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];

/** 卡片 / 文章 / 项目文档用到的正文（与 content-ai-queue 的范围一致） */
function readContents(path: string): Map<number, string> {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const has = (name: string) =>
      !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
    const parts: string[] = [];
    if (has("cards")) parts.push(`SELECT content_id FROM cards`);
    if (has("articles")) parts.push(`SELECT content_id FROM articles WHERE is_delete = 0`);
    if (has("project_item"))
      parts.push(`SELECT content_id FROM project_item WHERE project_item_type = 'document'`);
    if (!parts.length) return new Map();
    const rows = db
      .prepare(`SELECT c.id, c.content FROM contents c WHERE c.id IN (${parts.join(" UNION ")})`)
      .all() as Array<{ id: number; content: string | null }>;
    const result = new Map<number, string>();
    for (const row of rows) {
      try {
        const text = contentPlainText(JSON.parse(row.content ?? "[]"));
        if (text.trim()) result.set(row.id, text);
      } catch {
        // 坏正文跳过
      }
    }
    return result;
  } finally {
    db.close();
  }
}

/** 字符级改动占比 = 1 - LCS / max(len)，长文截前 3000 字（只用于报告，不参与判定） */
function changedShare(a: string, b: string): number {
  const x = Array.from(a.replace(/\s+/g, "")).slice(0, 3000);
  const y = Array.from(b.replace(/\s+/g, "")).slice(0, 3000);
  if (!x.length || !y.length) return 1;
  let prev = new Uint16Array(y.length + 1);
  let row = new Uint16Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      row[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sentences = (text: string) => text.split(/(?<=[。！？!?；;.\n])/).filter(s => s.trim());
const lengthOf = (text: string) => text.replace(/\s+/g, "").length;
const bucketOf = (length: number) =>
  length < 100
    ? "<100 字"
    : length < 300
      ? "100–300 字"
      : length < 1000
        ? "300–1000 字"
        : "≥1000 字";

interface Sample {
  kind: string;
  /** true = 应重算，false = 不应重算，null = 无标签 */
  expect: boolean | null;
  length: number;
  similarity: number;
  share: number;
  before: string;
  after: string;
}

/** 一份正文的人工编辑：各类各一份，条件不满足的类型跳过 */
function syntheticEdits(text: string, donor: string, random: () => number) {
  const edits: Array<{ kind: string; expect: boolean | null; after: string }> = [];
  const chars = Array.from(text);
  const donorSentences = sentences(donor);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  const replaceChars = (count: number) => {
    const next = [...chars];
    for (let i = 0; i < count; i++) {
      const at = Math.floor(random() * next.length);
      if (next[at].trim()) next[at] = pick(Array.from("的一是在不了有和人这中大为上个国我以要他"));
    }
    return next.join("");
  };
  edits.push({ kind: "改 1 字", expect: false, after: replaceChars(1) });
  edits.push({ kind: "改 3 字", expect: false, after: replaceChars(3) });
  edits.push({
    kind: "改 2% 的字",
    expect: false,
    after: replaceChars(Math.max(1, Math.round(chars.length * 0.02))),
  });
  const own = sentences(text);
  if (donorSentences.length) {
    const added = pick(donorSentences).trim().slice(0, 40);
    edits.push({ kind: "加一句", expect: false, after: `${text}${added}` });
  }
  if (own.length >= 3) {
    const at = Math.floor(random() * own.length);
    edits.push({
      kind: "删一句",
      expect: false,
      after: own.filter((_, i) => i !== at).join(""),
    });
  }
  const paragraphs = text.split("\n");
  if (paragraphs.length >= 2) {
    const swapped = [...paragraphs];
    const i = Math.floor(random() * (paragraphs.length - 1));
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    edits.push({ kind: "调换相邻段落", expect: false, after: swapped.join("\n") });
  }
  // 整段改写：换掉一段；这一段占全文 40% 以上才算大改，否则无标签
  const target = Math.floor(random() * paragraphs.length);
  const share = lengthOf(paragraphs[target]) / Math.max(1, lengthOf(text));
  const replacement = donor.slice(0, Math.max(10, paragraphs[target].length));
  edits.push({
    kind: "整段改写",
    expect: share >= 0.4 ? true : null,
    after: paragraphs.map((p, i) => (i === target ? replacement : p)).join("\n"),
  });
  // 改写过半：前一半正文换成别的内容
  const half = Math.ceil(chars.length / 2);
  edits.push({
    kind: "改写过半",
    expect: true,
    after: donor.slice(0, half) + chars.slice(half).join(""),
  });
  return edits;
}

describe.skipIf(!DIR)("重算阈值校准（真实库副本）", () => {
  it("输出报告", () => {
    const files = readdirSync(DIR!)
      .filter(name => /^version-\d+-.*data.*\.db$/.test(name))
      .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]) || a.localeCompare(b));
    expect(files.length).toBeGreaterThan(1);
    const snapshots = files.map(name => ({ name, contents: readContents(join(DIR!, name)) }));
    const latest = snapshots[snapshots.length - 1].contents;

    // 人工改写：按长度分层各取 60 份
    const random = rng(20261003);
    const texts = [...latest.values()];
    const byBucket = new Map<string, string[]>();
    for (const text of texts) {
      const bucket = bucketOf(lengthOf(text));
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), text]);
    }
    const synthetic: Sample[] = [];
    for (const list of byBucket.values()) {
      const chosen = [...list].sort(() => random() - 0.5).slice(0, 60);
      for (const text of chosen) {
        const donor = texts[Math.floor(random() * texts.length)];
        if (donor === text) continue;
        for (const edit of syntheticEdits(text, donor, random)) {
          synthetic.push({
            kind: edit.kind,
            expect: edit.expect,
            length: lengthOf(text),
            similarity: digestSimilarity(textDigest(text), textDigest(edit.after)),
            share: changedShare(text, edit.after),
            before: text,
            after: edit.after,
          });
        }
      }
    }

    // 真实编辑：相邻备份，以及隔约 10 个备份（累积编辑）
    const real: Sample[] = [];
    const pairs: Array<[number, number, string]> = [];
    for (let i = 1; i < snapshots.length; i++) pairs.push([i - 1, i, "相邻备份"]);
    for (let i = 10; i < snapshots.length; i += 5) pairs.push([i - 10, i, "隔 10 个备份"]);
    const seen = new Set<string>();
    for (const [from, to, kind] of pairs) {
      for (const [id, after] of snapshots[to].contents) {
        const before = snapshots[from].contents.get(id);
        if (before === undefined || before === after) continue;
        const key = `${kind}:${id}:${before.length}:${after.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        real.push({
          kind,
          expect: null,
          length: lengthOf(before),
          similarity: digestSimilarity(textDigest(before), textDigest(after)),
          share: changedShare(before, after),
          before,
          after,
        });
      }
    }

    const lines: string[] = [];
    const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
    lines.push(`# 重算阈值校准报告`, "");
    lines.push(`- 快照 ${files.length} 个：${files[0]} … ${files[files.length - 1]}`);
    lines.push(`- 人工改写样本 ${synthetic.length} 对，真实编辑 ${real.length} 对`, "");

    lines.push(`## 人工改写：各阈值下的误判`, "");
    lines.push(
      `「误重算」= 不该重算（小改）却低于阈值；「漏重算」= 该重算（大改）却不低于阈值。`,
      ""
    );
    lines.push(`| 阈值 | 误重算 | 漏重算 |`, `| --- | --- | --- |`);
    const small = synthetic.filter(s => s.expect === false);
    const big = synthetic.filter(s => s.expect === true);
    for (const t of THRESHOLDS) {
      lines.push(
        `| ${t} | ${pct(small.filter(s => s.similarity < t).length, small.length)} (${small.filter(s => s.similarity < t).length}/${small.length}) | ${pct(big.filter(s => s.similarity >= t).length, big.length)} (${big.filter(s => s.similarity >= t).length}/${big.length}) |`
      );
    }
    lines.push("", `## 人工改写：按长度分层的误重算 / 漏重算`, "");
    const bucketNames = ["<100 字", "100–300 字", "300–1000 字", "≥1000 字"];
    lines.push(
      `| 阈值 | ${bucketNames.join(" | ")} |`,
      `| --- | ${bucketNames.map(() => "---").join(" | ")} |`
    );
    for (const t of THRESHOLDS) {
      const cells = bucketNames.map(bucket => {
        const s1 = small.filter(s => bucketOf(s.length) === bucket);
        const b1 = big.filter(s => bucketOf(s.length) === bucket);
        return `${pct(s1.filter(s => s.similarity < t).length, s1.length)} / ${pct(b1.filter(s => s.similarity >= t).length, b1.length)}`;
      });
      lines.push(`| ${t} | ${cells.join(" | ")} |`);
    }
    lines.push(
      "",
      `## 人工改写：按类型与长度的相似度（中位 / 最低 / 最高），以及 0.8 下的重算比例`,
      ""
    );
    lines.push(`| 类型 | 长度 | 样本 | 中位 | 最低 | 最高 | <0.8 重算 | 改动占比中位 |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
    const groups = new Map<string, Sample[]>();
    for (const s of synthetic) {
      const key = `${s.kind}\u0000${bucketOf(s.length)}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const order = ["<100 字", "100–300 字", "300–1000 字", "≥1000 字"];
    for (const [key, list] of [...groups].sort(
      ([a], [b]) =>
        a.split("\u0000")[0].localeCompare(b.split("\u0000")[0]) ||
        order.indexOf(a.split("\u0000")[1]) - order.indexOf(b.split("\u0000")[1])
    )) {
      const [kind, bucket] = key.split("\u0000");
      const sims = list.map(s => s.similarity);
      lines.push(
        `| ${kind} | ${bucket} | ${list.length} | ${median(sims).toFixed(2)} | ${Math.min(...sims).toFixed(2)} | ${Math.max(...sims).toFixed(2)} | ${pct(list.filter(s => s.similarity < 0.8).length, list.length)} | ${median(list.map(s => s.share)).toFixed(2)} |`
      );
    }

    lines.push("", `## 真实编辑：各阈值下会触发重算的比例`, "");
    lines.push(`| 阈值 | 相邻备份 | 隔 10 个备份 |`, `| --- | --- | --- |`);
    const adjacent = real.filter(s => s.kind === "相邻备份");
    const far = real.filter(s => s.kind !== "相邻备份");
    for (const t of THRESHOLDS) {
      lines.push(
        `| ${t} | ${pct(adjacent.filter(s => s.similarity < t).length, adjacent.length)} | ${pct(far.filter(s => s.similarity < t).length, far.length)} |`
      );
    }
    lines.push("", `## 真实编辑：相似度与字符改动占比`, "");
    lines.push(
      `| 相似度区间 | 样本 | 改动占比中位 | 改动占比最低 | 改动占比最高 |`,
      `| --- | --- | --- | --- | --- |`
    );
    for (const [low, high] of [
      [0, 0.5],
      [0.5, 0.7],
      [0.7, 0.8],
      [0.8, 0.9],
      [0.9, 1.01],
    ]) {
      const list = real.filter(s => s.similarity >= low && s.similarity < high);
      if (!list.length) continue;
      const shares = list.map(s => s.share);
      lines.push(
        `| ${low}–${Math.min(high, 1)} | ${list.length} | ${median(shares).toFixed(2)} | ${Math.min(...shares).toFixed(2)} | ${Math.max(...shares).toFixed(2)} |`
      );
    }
    lines.push("", `## 真实编辑：阈值附近的样例（相似度 0.65–0.9，最多 24 条）`, "");
    const clip = (text: string) => text.replace(/\s+/g, " ").slice(0, 120);
    for (const s of real
      .filter(s => s.similarity >= 0.65 && s.similarity < 0.9)
      .sort((a, b) => a.similarity - b.similarity)
      .slice(0, 24)) {
      lines.push(
        `- **${s.similarity.toFixed(2)}**（${s.kind}，${s.length} 字，改动占比 ${s.share.toFixed(2)}）`,
        `  - 前：${clip(s.before)}`,
        `  - 后：${clip(s.after)}`
      );
    }
    writeFileSync(OUT, lines.join("\n") + "\n");
    console.log(`[digest-eval] 报告已写入 ${OUT}`);
  }, 600_000);
});
