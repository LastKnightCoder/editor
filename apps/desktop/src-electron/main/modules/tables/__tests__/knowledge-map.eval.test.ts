/**
 * 知识地图主题质量评估：在真实库副本上跑完整计算，用节点自己的命名路径（tag / 项目路径）首段当参照。
 * 默认跳过；需要时设置环境变量指向库副本再跑（主进程测试要用 Electron 内置 Node，见 docs/knowledge-loop/05 踩坑）：
 *
 *   KL_MAP_EVAL_MAIN=/tmp/kl-m.db KL_MAP_EVAL_INDEX=/tmp/kl-i.db \
 *   ELECTRON_RUN_AS_NODE=1 npx electron ../../node_modules/vitest/vitest.mjs run knowledge-map.eval
 *
 * 指标：主题纯度（成员里多数路径首段的占比，按人数加权）、主题与子主题列表、
 * 没有名字的子主题数、指定样本（TypeScript 卡片、Docker 项目文档）落在哪里。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { it } from "vitest";
import { computeKnowledgeMap } from "@/knowledge-map/compute";
import { meanPool } from "@/knowledge-map/vectors";
import KnowledgeMapTable from "../knowledge-map";

const MAIN = process.env.KL_MAP_EVAL_MAIN;
const INDEX = process.env.KL_MAP_EVAL_INDEX;
const headOf = (tags: string[]) => (tags[0] ?? "").split(/[/／]/)[0].trim();

it.skipIf(!MAIN || !INDEX)(
  "知识地图主题质量评估（真实库）",
  () => {
    const main = new Database(MAIN!, { readonly: true });
    const index = new Database(INDEX!);
    index.loadExtension(sqliteVec.getLoadablePath());
    const inputs = KnowledgeMapTable.readInputs(main, index);
    const items = KnowledgeMapTable.listItems(main, index);
    const vectors = meanPool(
      new Map(inputs.chunks.map(([id, buffers]) => [id, buffers.map(b => new Float32Array(b))]))
    );
    const started = performance.now();
    const map = computeKnowledgeMap(inputs.nodes, vectors);
    const ms = Math.round(performance.now() - started);

    const nodeOf = new Map(map.nodes.map(node => [node.key, node]));
    const nameOf = new Map(map.topics.map(topic => [topic.id, topic.label || "?"]));
    const tops = map.topics.filter(topic => topic.parent === -1);

    let majority = 0;
    let tagged = 0;
    const lines: string[] = [];
    for (const top of tops) {
      const members = items.filter(item => nodeOf.get(item.key)?.topic === top.id);
      const counts = new Map<string, number>();
      for (const item of members) {
        const head = headOf(item.tags);
        if (!head) continue;
        counts.set(head, (counts.get(head) ?? 0) + 1);
        tagged++;
      }
      const best = Math.max(0, ...counts.values());
      majority += best;
      const subs = map.topics
        .filter(sub => sub.parent === top.id)
        .map(sub => `${sub.label || "?"}(${sub.size})`)
        .join(" ");
      lines.push(
        `  ${top.label || "?"}(${members.length}) 纯度=${(
          best /
          Math.max(
            1,
            [...counts.values()].reduce((a, b) => a + b, 0)
          )
        ).toFixed(2)} | ${subs}`
      );
    }

    const where = (label: string, pick: (item: (typeof items)[number]) => boolean) => {
      const placed = new Map<string, number>();
      for (const item of items.filter(pick)) {
        const node = nodeOf.get(item.key);
        if (!node) continue;
        const key = `${nameOf.get(node.topic) ?? "未归类"}/${node.subtopic >= 0 ? nameOf.get(node.subtopic) : "-"}`;
        placed.set(key, (placed.get(key) ?? 0) + 1);
      }
      return `${label}: ${[...placed].map(([k, v]) => `${k}×${v}`).join(", ")}`;
    };

    // 设置 KL_MAP_EVAL_DETAIL=1 时列出无名子主题的成分（多数路径首段与无名成员数）
    const detail = process.env.KL_MAP_EVAL_DETAIL
      ? map.topics
          .filter(topic => topic.parent !== -1 && !topic.label)
          .map(topic => {
            const members = items.filter(item => nodeOf.get(item.key)?.subtopic === topic.id);
            const heads = new Map<string, number>();
            for (const item of members) {
              const head = headOf(item.tags) || "(无 tag)";
              heads.set(head, (heads.get(head) ?? 0) + 1);
            }
            const top = [...heads].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sample = members
              .slice(0, 3)
              .map(item => item.title.slice(0, 14))
              .join(" / ");
            return `  ? 于 ${nameOf.get(topic.parent)}(${members.length}): ${top.map(([h, c]) => `${h}×${c}`).join(", ")} | ${sample}`;
          })
      : [];

    // 越界：节点离自己主题的质心，比离最近的别的主题的质心还远（被摆到了别人的岛边）
    const centroid = new Map<number, { x: number; y: number }>();
    for (const top of tops) {
      const ms = map.nodes.filter(node => node.topic === top.id);
      centroid.set(top.id, {
        x: ms.reduce((a, n) => a + n.x, 0) / ms.length,
        y: ms.reduce((a, n) => a + n.y, 0) / ms.length,
      });
    }
    let escaped = 0;
    const escapedBySub = new Map<string, number>();
    for (const node of map.nodes) {
      if (node.topic < 0) continue;
      const own = centroid.get(node.topic)!;
      const dOwn = Math.hypot(node.x - own.x, node.y - own.y);
      let dOther = Infinity;
      for (const [id, c] of centroid)
        if (id !== node.topic) dOther = Math.min(dOther, Math.hypot(node.x - c.x, node.y - c.y));
      if (dOther < dOwn) {
        escaped++;
        const key = `${nameOf.get(node.topic)}/${node.subtopic >= 0 ? nameOf.get(node.subtopic) : "-"}`;
        escapedBySub.set(key, (escapedBySub.get(key) ?? 0) + 1);
      }
    }

    console.log(
      [
        `地图尺寸=${Math.round(Math.max(...map.nodes.map(n => n.x)) - Math.min(...map.nodes.map(n => n.x)))}×${Math.round(Math.max(...map.nodes.map(n => n.y)) - Math.min(...map.nodes.map(n => n.y)))} 越界节点=${escaped} ${[
          ...escapedBySub,
        ]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => `${k}×${v}`)
          .join(", ")}`,
        `子主题与大主题撞名：${
          map.topics
            .filter(t => t.parent !== -1 && t.label && tops.some(top => top.label === t.label))
            .map(t => `${t.label}(于 ${nameOf.get(t.parent)})`)
            .join(", ") || "无"
        }`,
        `EVAL 节点=${items.length} 耗时=${ms}ms 大主题=${tops.length} 子主题=${map.topics.length - tops.length} 无名子主题=${map.topics.filter(t => t.parent !== -1 && !t.label).length} 未归类=${map.nodes.filter(n => n.topic === -1).length} 主题纯度=${(majority / Math.max(1, tagged)).toFixed(3)}`,
        ...lines,
        where(
          "TypeScript 卡片",
          item => item.kind === "card" && headOf(item.tags) === "TypeScript"
        ),
        where("Docker 文档", item => /docker/i.test(item.projectTitle ?? "")),
        ...detail,
      ].join("\n")
    );
  },
  600_000
);
