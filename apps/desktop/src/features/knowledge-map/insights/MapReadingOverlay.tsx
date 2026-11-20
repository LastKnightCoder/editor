/**
 * 洞见视图「读」的过程叠在地图上的一层：只点亮后台此刻真正交给 AI 读的那个主题。
 *
 * - topic 阶段：那个主题的节点各套一圈轻轻呼吸的光（错开起点，看起来像在一篇篇地看），
 *   其余地方盖一层很淡的纸色，把视线收到这一块上。换下一个主题时亮的区域跟着挪过去。
 * - global 阶段：不再压暗，每个主题的岛一起淡淡亮一下，表示在把各主题放在一起看。
 * - 其他阶段（刚开始、没变化的主题被跳过）什么都不画。
 *
 * 节点多的主题只挑一部分点亮（均匀抽样），免得一帧里重算几百个位置。
 * 坐标随地图平移缩放，和 MapInsightsOverlay 一样按帧重算。
 */

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { GraphOverlayApi } from "@/components/LinkGraph";
import type { KnowledgeMapNode } from "@/knowledge-map/types";
import type { KnowledgeInsightsPhase } from "@/types/knowledge-insights";

/** 一个主题最多点亮几个节点 */
const MAX_LIT = 60;
/** 呼吸周期（与 tailwind.css 的 insight-glow 一致），起点在这一段里错开 */
const GLOW_PERIOD_S = 2.4;

export interface MapReadingOverlayProps {
  api: GraphOverlayApi;
  nodes: KnowledgeMapNode[];
  phase: KnowledgeInsightsPhase | null;
  /** 地图上的大主题 id（global 阶段每个岛亮一下） */
  topicIds: number[];
}

function useFrame(api: GraphOverlayApi) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const unsubscribe = api.subscribeFrame(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick(tick => tick + 1);
      });
    });
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [api]);
}

/** 均匀抽样，保证点亮的节点铺满整个主题而不是挤在一角 */
export function sampleKeys(keys: string[], limit: number): string[] {
  if (keys.length <= limit) return keys;
  const step = keys.length / limit;
  return Array.from({ length: limit }, (_, index) => keys[Math.floor(index * step)]);
}

/** 错开的起点：黄金分割取小数部分，相邻节点不会同时亮 */
const glowDelay = (index: number): CSSProperties => ({
  animationDelay: `${(((index * 0.618) % 1) * GLOW_PERIOD_S).toFixed(2)}s`,
});

export function MapReadingOverlay({ api, nodes, phase, topicIds }: MapReadingOverlayProps) {
  useFrame(api);
  // useId 带「:」「«»」之类的字符，放进 url(#…) 会失效，只留字母数字
  const maskId = `map-reading-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const topicId = phase?.phase === "topic" ? phase.topicId : null;
  const lit = useMemo(
    () =>
      topicId === null
        ? []
        : sampleKeys(
            nodes.filter(node => node.topic === topicId).map(node => node.key),
            MAX_LIT
          ),
    [nodes, topicId]
  );

  if (phase?.phase === "global") {
    return (
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {topicIds.map(id => {
          const island = api.topicShape(id);
          if (!island) return null;
          return (
            <circle
              key={id}
              cx={island.x}
              cy={island.y}
              r={island.radius}
              fill="var(--tau-accent-soft)"
              className="animate-insight-glow motion-reduce:animate-none motion-reduce:opacity-50"
            />
          );
        })}
      </svg>
    );
  }

  if (topicId === null) return null;
  const island = api.topicShape(topicId);
  const points = lit.flatMap(key => {
    const at = api.project(key);
    return at ? [{ key, ...at }] : [];
  });

  return (
    <svg
      key={topicId}
      className="animate-fadeIn absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
      data-map-reading={topicId}
    >
      {island && (
        <>
          <defs>
            <radialGradient id={`${maskId}-hole`}>
              <stop offset="70%" stopColor="black" />
              <stop offset="100%" stopColor="white" />
            </radialGradient>
            <mask id={`${maskId}-mask`}>
              <rect x="-50%" y="-50%" width="200%" height="200%" fill="white" />
              <circle
                cx={island.x}
                cy={island.y}
                r={island.radius * 1.25}
                fill={`url(#${maskId}-hole)`}
              />
            </mask>
          </defs>
          <rect
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            fill="var(--tau-bg-surface)"
            opacity={0.5}
            mask={`url(#${maskId}-mask)`}
            className="transition-opacity duration-500"
          />
        </>
      )}
      {points.map((point, index) => (
        <circle
          key={point.key}
          cx={point.x}
          cy={point.y}
          r={Math.max(4, point.r + 3)}
          fill="var(--tau-accent-soft)"
          stroke="var(--tau-accent)"
          strokeWidth={1.25}
          style={glowDelay(index)}
          className="animate-insight-glow motion-reduce:animate-none motion-reduce:opacity-60"
        />
      ))}
    </svg>
  );
}
