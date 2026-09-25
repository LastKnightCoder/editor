/**
 * 块预览档案 —— 展品即真实的统一预览框（BlockPreviewFrame）+ 注册表里的渲染器，
 * 以及对话里的块卡片 / 直出块。PlantUML 走 plantuml.com 在线渲染，离线时显示错误态。
 */

import { useState } from "react";
import { Segmented } from "@tau/ui";
import BlockCard from "@/components/BlockCard";
import { BlockPreviewFrame } from "@/features/previews/components/BlockPreviewFrame";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { BlockTitle, CanvasCard, DocHead, MatrixRow } from "../kit";

const SAMPLES: Record<string, string> = {
  html: `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>电影感全屏演示模板</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(120% 90% at 20% 10%,#2a2118,#120e0a 70%);color:#f3e7d3;font-family:Georgia,serif}
h1{font-size:42px;font-weight:500;margin:0 0 12px}p{color:#bfae95;margin:0}a{color:#d9a55b}</style></head>
<body><main><div style="letter-spacing:.3em;font:11px sans-serif;color:#d9a55b">CHAPTER 01 · COVER</div>
<h1>把时间交给真正重要的事</h1><p>外链测试：<a href="https://example.com">example.com</a></p></main></body></html>`,
  "mind-map": `- 煤气灯效应（Gaslighting）
  - 定义
    - 通过否认、歪曲事实让对方怀疑自身认知
  - 常见手法
    - 否认发生过的事
    - 轻视感受
    - 孤立
  - 识别信号
    - 频繁自我怀疑
    - 总在道歉
  - 应对
    - 记录事实
    - 寻求第三方视角`,
  mermaid: `graph LR
  N[新卡片] --> L[学习中] --> R[复习中]
  L --> G{评分}
  G -->|忘记| RL[重新学习]
  G -->|记得| S[计算 S / D]`,
  whiteboard: `board: FSRS 调度流程
layout: flow-right
node: 新卡片 [id=new, tone=blue]
node: 学习中 [id=learn]
node: 复习中 [id=review, tone=green]
edge: new -> learn
edge: learn -> review [label=通过]`,
  plantuml: `@startuml
title 同步时序
客户端 -> 服务端: 推送变更
服务端 --> 客户端: 确认
@enduml`,
  tikz: `\\begin{tikzpicture}
\\draw[->] (0,0) -- (4,0) node[right] {$t$};
\\draw[->] (0,0) -- (0,3) node[above] {$R$};
\\draw[thick] (0,2.8) .. controls (1,1) and (2,0.6) .. (4,0.4);
\\end{tikzpicture}`,
};

const block = (type: string, content = SAMPLES[type]): BlockData => {
  const renderer = blockRegistry.get(type)!;
  return {
    id: `showcase-${type}`,
    type,
    content,
    metadata: { type, language: type, title: renderer.title?.(content) },
  };
};

function FrameDemo() {
  const [type, setType] = useState("html");
  const [generating, setGenerating] = useState(false);
  const renderer = blockRegistry.get(type)!;
  const content = generating
    ? SAMPLES[type].slice(0, Math.floor(SAMPLES[type].length * 0.6))
    : SAMPLES[type];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented label="块类型" size="sm" value={type} onValueChange={setType}>
          {Object.keys(SAMPLES).map(t => (
            <Segmented.Item key={t} value={t} label={blockRegistry.get(t)!.label} />
          ))}
        </Segmented>
        <Segmented
          label="状态"
          size="sm"
          value={generating ? "gen" : "ready"}
          onValueChange={v => setGenerating(v === "gen")}
        >
          <Segmented.Item value="ready" label="就绪" />
          <Segmented.Item value="gen" label="生成中" />
        </Segmented>
      </div>
      <div className="bg-surface shadow-card rounded-tau-lg h-[520px] overflow-hidden">
        <BlockPreviewFrame
          key={type}
          block={block(type, content)}
          renderer={renderer}
          generating={generating}
          versions={
            type === "html"
              ? { version: 3, count: 3, onPrev: () => {}, onNext: () => {} }
              : undefined
          }
          onClose={() => {}}
        />
      </div>
    </>
  );
}

export default function BlockPreviewSection() {
  const mermaid = blockRegistry.get("mermaid")!;
  const Inline = mermaid.Inline!;
  return (
    <>
      <DocHead
        title="块预览"
        en="features/previews"
        duty="对话里模型产出的可预览块：统一预览框（头部骨架 + 预览⇄源码 + 专属工具 + 更多菜单 + 缩放浮控）承载注册表里的渲染器；对话里是块卡片或直出块。"
        src="apps/desktop/src/features/previews/components/BlockPreviewFrame.tsx"
      />
      <BlockTitle en="Frame">统一预览框</BlockTitle>
      <CanvasCard cap="LIVE · 切换类型与状态" stage="page" stageClassName="">
        <FrameDemo />
      </CanvasCard>

      <BlockTitle en="In chat">对话里的形态</BlockTitle>
      <MatrixRow name="块卡片" desc="默认 / 生成中（同一产物多版本时标 vN，预览中 accent 轻染）">
        <div className="w-full max-w-[520px]">
          <BlockCard
            block={block("html")}
            renderer={blockRegistry.get("html")!}
            generating={false}
            onOpen={() => {}}
          />
          <BlockCard
            block={block("mind-map", SAMPLES["mind-map"].slice(0, 60))}
            renderer={blockRegistry.get("mind-map")!}
            generating
            onOpen={() => {}}
          />
        </div>
      </MatrixRow>
      <MatrixRow
        name="直出块（Mermaid）"
        desc="对话里直接画出来，悬停右上角出现「复制源码 / 放大」"
      >
        <div className="w-full max-w-[520px]">
          <Inline block={block("mermaid")} generating={false} onExpand={() => {}} />
        </div>
      </MatrixRow>
    </>
  );
}
