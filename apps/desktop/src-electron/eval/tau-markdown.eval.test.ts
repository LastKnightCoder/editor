// @vitest-environment node
import { it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { deepStrictEqual } from "node:assert";
import { createMarkdownProcessor, encodeTauMarkdown, decodeTauMarkdown } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import type { Descendant } from "slate";

const copyPath = process.env.TAU_MARKDOWN_DB_COPY;
const processor = createMarkdownProcessor({
  codecs: [...editorMarkdownCodecs],
  textCodecs: [textFormattingCodec],
});

function isolatedCopy() {
  if (!copyPath) throw new Error("需要 TAU_MARKDOWN_DB_COPY");
  const file = realpathSync(copyPath);
  if (file.startsWith(resolve(homedir(), ".editor") + sep))
    throw new Error("禁止使用用户资料库作为验证写入目标");
  const isolation = JSON.parse(readFileSync(join(dirname(file), "isolation.json"), "utf8"));
  if (realpathSync(isolation.copyPath) !== file || isolation.sourceReadOnly !== true)
    throw new Error("副本缺少只读备份来源记录");
  return file;
}
const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
};

it.runIf(!!copyPath)(
  "全部真实正文副本经 Tau Markdown 往返保留持久化数据",
  () => {
    const file = isolatedCopy();
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const durations: number[] = [];
    const failures: Array<{ id: number; stage: string }> = [];
    let documents = 0,
      jsonBytes = 0,
      markdownBytes = 0;
    const types = new Set<string>();
    try {
      const contracts = db.prepare("SELECT contracts FROM content_documents WHERE content_id=?");
      for (const row of db
        .prepare("SELECT id, content FROM content_snapshots ORDER BY id")
        .iterate() as Iterable<{ id: number; content: string }>) {
        let stage = "parse-source";
        try {
          const original = JSON.parse(row.content) as Descendant[];
          const dictionary = contracts.get(row.id) as { contracts: string } | undefined;
          const metadata = { contracts: dictionary ? JSON.parse(dictionary.contracts) : {} };
          const start = performance.now();
          stage = "encode";
          const markdown = encodeTauMarkdown(original, { processor, metadata });
          stage = "decode";
          const restored = decodeTauMarkdown(markdown, { processor });
          stage = "compare";
          deepStrictEqual(restored.content, original);
          deepStrictEqual(restored.metadata, metadata);
          durations.push(performance.now() - start);
          jsonBytes += Buffer.byteLength(row.content);
          markdownBytes += Buffer.byteLength(markdown);
          const visit = (nodes: Descendant[]) => {
            for (const node of nodes) {
              if ("children" in node) {
                types.add(node.type);
                visit(node.children);
              }
            }
          };
          visit(original);
          documents++;
        } catch {
          failures.push({ id: row.id, stage });
        }
      }
    } finally {
      db.close();
    }
    const report = {
      documents,
      failures,
      types: [...types].sort(),
      jsonBytes,
      markdownBytes,
      ratio: markdownBytes / jsonBytes,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      totalMs: durations.reduce((sum, value) => sum + value, 0),
      copySha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    };
    writeFileSync(join(dirname(file), "roundtrip.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ documents, failures, p95Ms: report.p95Ms, ratio: report.ratio }));
    expect(documents).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  },
  180_000
);

it.runIf(process.env.TAU_MARKDOWN_STRESS === "1")(
  "原生协议的容量、随机数据与连续编辑压力",
  () => {
    if (!copyPath) throw new Error("压测需要隔离副本目录");
    const directory = dirname(isolatedCopy());
    let state = 0x2a9f0173;
    const random = (max: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % max;
    };
    const samples = [
      "中文",
      "😀",
      "\u0000\r\n",
      "\ud800",
      "\u200b",
      "**普通字符**",
      "\u0060".repeat(40),
      ":::tau {}",
    ];
    let fuzzed = 0;
    for (let round = 0; round < 1000; round++) {
      const value = samples[random(samples.length)] + round + samples[random(samples.length)];
      const nodes = [
        {
          type: "future-node",
          collabId: "node-" + round,
          future: { list: [null, true, value] },
          children: [{ type: "formatted", text: value, unknown: { n: random(20) } }],
        },
      ];
      deepStrictEqual(
        decodeTauMarkdown(encodeTauMarkdown(nodes, { processor }), { processor }).content,
        nodes
      );
      fuzzed++;
    }
    const scales = [];
    for (const rows of [100, 1000, 10000]) {
      const nodes = [
        {
          type: "table",
          collabId: "table",
          children: Array.from({ length: rows }, (_, row) => ({
            type: "table-row",
            collabId: "row-" + row,
            color: row % 2 ? "blue" : "green",
            children: [0, 1].map(column => ({
              type: "table-cell",
              collabId: "cell-" + row + "-" + column,
              children: [{ type: "formatted", text: "第" + row + "行、第" + column + "列" }],
            })),
          })),
        },
      ];
      const encodeMs: number[] = [],
        decodeMs: number[] = [];
      let bytes = 0;
      for (let round = 0; round < 31; round++) {
        const start = performance.now();
        const markdown = encodeTauMarkdown(nodes, { processor });
        const encoded = performance.now();
        const decoded = decodeTauMarkdown(markdown, { processor });
        const end = performance.now();
        deepStrictEqual(decoded.content, nodes);
        if (round) {
          encodeMs.push(encoded - start);
          decodeMs.push(end - encoded);
        }
        bytes = Buffer.byteLength(markdown);
      }
      scales.push({
        rows,
        bytes,
        encodeP50Ms: percentile(encodeMs, 0.5),
        encodeP95Ms: percentile(encodeMs, 0.95),
        decodeP50Ms: percentile(decodeMs, 0.5),
        decodeP95Ms: percentile(decodeMs, 0.95),
        rssBytes: process.memoryUsage().rss,
      });
    }
    let current: unknown[] = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            collabId: "edit-row",
            color: "blue",
            children: [{ type: "table-cell", children: [{ type: "formatted", text: "内容" }] }],
          },
        ],
      },
    ];
    for (let round = 0; round < 500; round++) {
      const markdown = encodeTauMarkdown(current, { processor });
      const color = round % 2 ? "green" : "blue";
      const next = decodeTauMarkdown(
        markdown.replace(/"color":"(?:blue|green)"/, '"color":"' + color + '"'),
        { processor }
      );
      const expected = structuredClone(current);
      const table = expected[0];
      if (
        !table ||
        typeof table !== "object" ||
        !("children" in table) ||
        !Array.isArray(table.children)
      )
        throw new Error("缺少表格");
      Object.assign(table.children[0], { color });
      deepStrictEqual(next.content, expected);
      current = next.content;
    }
    let deep: unknown = { type: "formatted", text: "底部" };
    for (let level = 0; level < 64; level++) deep = { type: "nested", level, children: [deep] };
    const nested = [deep];
    deepStrictEqual(decodeTauMarkdown(encodeTauMarkdown(nested)).content, nested);
    const report = {
      fuzzed,
      continuousEdits: 500,
      warmupRounds: 1,
      measuredRounds: 30,
      scales,
      maxDepth: 64,
      failures: [],
    };
    writeFileSync(
      join(directory, "pressure-" + Date.now() + ".json"),
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report));
    expect(fuzzed).toBeGreaterThan(0);
  },
  240_000
);
