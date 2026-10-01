/**
 * 关联图谱档案 —— 展品是真实的 LinkGraph（自研 canvas 渲染），喂合成卡片。
 *
 * 样板间的价值在这里尤其大：图谱的观感（节点轻重、连线淡度、标签密度、深浅色
 * 是否都看得清）只有真画出来才评得了，而卡片库里的真实数据不便当基准。
 * 三种规模对应实现里的档位：小图全量精细、中图靠标签分级、稀疏图看孤立节点表现。
 */

import { useMemo, useState } from "react";
import LinkGraph, { type GraphItem } from "@/components/LinkGraph";
import { labelFromContent } from "@/components/LinkGraph/core/graph";
import type { KnowledgeMap, KnowledgeMapTopic } from "@/knowledge-map/types";
import type { ICard } from "@/types";
// 真实卡片库的离线知识地图导出（坐标、主题、显式链接为真，标题已替换为「主题 · 子主题 · 序号」）。
// 含个人 tag 与链接结构，已 gitignore、不进仓库；本机没有该文件时「知识地图」形态不出现。
const fixtureModules = import.meta.glob<{ default: { topics: unknown[]; nodes: unknown[] } }>(
  "./linkGraphMapFixture.json",
  { eager: true }
);
const mapFixture = Object.values(fixtureModules)[0]?.default ?? null;
import { BlockTitle, CanvasCard, DocHead, Segmented } from "../kit";

type Shape = "map" | "cluster" | "dense" | "sparse";

const SHAPES: { value: Shape; label: string; count: number }[] = [
  ...(mapFixture ? [{ value: "map" as const, label: "知识地图（本机数据）", count: 0 }] : []),
  { value: "cluster", label: "主题簇 · 120", count: 120 },
  { value: "dense", label: "密集 · 700", count: 700 },
  { value: "sparse", label: "稀疏 · 80", count: 80 },
];

const TOPICS = [
  "记忆与遗忘曲线",
  "间隔重复",
  "认知负荷",
  "费曼技巧",
  "写作即思考",
  "卡片盒笔记法",
  "知识的涌现",
  "元认知",
];

/** 确定性伪随机：样板间每次打开要看到同一张图，否则无法对照改动 */
const seeded = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

function makeCards(shape: Shape, count: number): ICard[] {
  const random = seeded(42);
  const clusterSize = shape === "sparse" ? 4 : 15;
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const withinCluster = index % clusterSize;
    const links: number[] = [];

    if (withinCluster !== 0) {
      // 簇内挂到随机的前序同簇节点，形成有分叉的树而不是一条链
      const base = index - withinCluster;
      links.push(base + Math.floor(random() * withinCluster) + 1);
    } else if (id > clusterSize && shape !== "sparse") {
      links.push(id - clusterSize);
    }
    // 密集图额外撒一些跨簇连线
    if (shape === "dense" && random() < 0.25) {
      links.push(Math.floor(random() * count) + 1);
    }
    if (shape === "sparse" && random() < 0.35) links.length = 0;

    const topic = TOPICS[Math.floor(index / clusterSize) % TOPICS.length];
    return {
      id,
      links: links.filter(target => target !== id),
      content: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: `${topic} ${withinCluster + 1}` }],
        },
      ],
      create_time: 1700000000000 + index * 3600_000,
      update_time: 1700000000000 + index * 3600_000,
      tags: [topic],
      count: 120,
      contentId: id,
      isTop: false,
      category: "permanent",
    } as unknown as ICard;
  });
}

type FixtureNode = [number, number, number, number, number, string, number[]];

function fixtureMap(): { cards: ICard[]; map: KnowledgeMap } | null {
  if (!mapFixture) return null;
  const nodes = mapFixture.nodes as FixtureNode[];
  const cards = nodes.map(([id, , , , , title, links]) => ({
    id,
    links,
    tags: [],
    content: [{ type: "paragraph", children: [{ type: "formatted", text: title }] }],
    // 导出里没有创建时间：按 id 铺成约三年（id 大致随创建递增），样板间的生长动画才有日期可看
    create_time: 1610000000000 + id * 36 * 3600_000,
    update_time: 1610000000000 + id * 36 * 3600_000,
    count: 0,
    contentId: id,
    isTop: false,
    category: "permanent",
  })) as unknown as ICard[];
  return {
    cards,
    map: {
      computedAt: 1,
      topics: mapFixture.topics as KnowledgeMapTopic[],
      nodes: nodes.map(([cardId, x, y, topic, subtopic]) => ({
        key: `card:${cardId}`,
        x,
        y,
        topic,
        subtopic,
      })),
    },
  };
}

export default function LinkGraphSection() {
  const [shape, setShape] = useState<Shape>(mapFixture ? "map" : "cluster");
  const meta = SHAPES.find(item => item.value === shape)!;
  const fixture = useMemo(() => (shape === "map" ? fixtureMap() : null), [shape]);
  const cards = useMemo(
    () => fixture?.cards ?? makeCards(shape, meta.count),
    [fixture, shape, meta.count]
  );
  const items = useMemo<GraphItem[]>(
    () =>
      cards.map(card => ({
        id: card.id,
        key: `card:${card.id}`,
        label: labelFromContent(card.content),
        createdAt: card.create_time,
        tags: card.tags,
        links: card.links,
        contentId: card.contentId,
      })),
    [cards]
  );
  const highlightIds = useMemo(() => [1, 16, 31], []);

  return (
    <>
      <DocHead
        title="关联图谱"
        en="LinkGraph"
        duty="卡片之间的链接关系画成力导向图。自研 canvas 渲染：core 层（图/布局/相机/命中/调色板）+ Canvas 2D 渲染器，颜色全部从 --tau-* 派生并有对比度门禁。"
        src="src/components/LinkGraph"
      />

      <BlockTitle>规模与形态</BlockTitle>
      <div className="mt-3">
        <Segmented
          value={shape}
          onChange={setShape}
          options={SHAPES.map(({ value, label }) => ({ value, label }))}
        />
      </div>

      <CanvasCard
        cap="LIVE"
        note="滚轮缩放 · 拖画布平移 · 拖节点固定 · 悬停高亮一度邻居 · 布局坐标落盘（重开保持形状）"
        stageClassName="mt-4 h-[520px]"
      >
        {/* 样板间没有 Electron 的 RPC，关掉悬停正文预览（悬停高亮仍生效） */}
        <LinkGraph
          key={shape}
          items={items}
          currentCardIds={highlightIds}
          enableHoverPreview={false}
          persistKey={`showcase-${shape}`}
          knowledgeMap={fixture?.map ?? null}
          // 左下角说明行，点一下播放生长动画（同知识地图页）
          caption
          captionUnit={{ measure: "张", noun: "卡片" }}
        />
      </CanvasCard>
    </>
  );
}
