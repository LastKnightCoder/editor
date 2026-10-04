/**
 * 洞见视图叠在地图上的那一层：标记按顺序画出来（呼应蓝弧线、问了没写黄虚线圈「?」、重复灰点线、
 * 矛盾红波浪线、缺一环链 + 虚线空位、同一思路淡紫圈、还缺主题名下的淡注），全局层有发现的主题名后一个小点。
 *
 * 选中一处时其余标记降淡，涉及的每篇笔记加一圈强调并在旁边标出标题。
 *
 * 坐标随地图平移缩放：订阅 LinkGraph 的每帧回调，按帧重新算一遍（每层最多 6 处，开销可以忽略）。
 * 容器不接指针事件，只有标记与主题名的点击区接。
 */

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@tau/ui";
import type { GraphOverlayApi } from "@/components/LinkGraph";
import type { KnowledgeMark } from "@/types/knowledge-insights";
import { MARK_META, endpointKey, markGeometry, topicLabelPoint, type Point } from "./model";

/** 每处标记依次出现的间隔 */
export const DRAW_STAGGER_MS = 320;
const DRAW_LEAD_MS = 250;

export interface OverlayTopic {
  topicId: number;
  label: string;
}

export interface MapInsightsOverlayProps {
  api: GraphOverlayApi;
  marks: KnowledgeMark[];
  /** 主题层时为主题 id，全局层为 null */
  topicId: number | null;
  topicByLabel: (label: string) => number | null;
  /** 全局层：有发现的主题（名字后一个小点，点了飞进去） */
  topics: OverlayTopic[];
  current: string | null;
  /** 变了就重新播放画出的动画（进入视图、换一层） */
  revealKey: number;
  onPick(markId: string): void;
  onPickTopic(topicId: number): void;
  /** 当前一处的气泡锚点（零尺寸元素，跟着地图走） */
  onAnchor(element: HTMLElement | null): void;
}

/** 订阅地图重绘：一帧里多次回调只渲染一次 */
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

const delay = (index: number): CSSProperties => ({
  animationDelay: `${DRAW_LEAD_MS + index * DRAW_STAGGER_MS}ms`,
});

export function MapInsightsOverlay({
  api,
  marks,
  topicId,
  topicByLabel,
  topics,
  current,
  revealKey,
  onPick,
  onPickTopic,
  onAnchor,
}: MapInsightsOverlayProps) {
  useFrame(api);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => onAnchor(anchorEl), [anchorEl, onAnchor]);

  let gapIndex = 0;
  const shapes = marks.map(mark => ({
    mark,
    shape: markGeometry(mark, api, {
      topicId,
      topicByLabel,
      gapIndex: mark.kind === "gap" ? gapIndex++ : 0,
    }),
  }));
  const currentMark = shapes.find(item => item.mark.id === current);
  const currentAnchor: Point | null = currentMark?.shape?.anchor ?? null;
  const involved = (currentMark?.mark.ends ?? []).flatMap(end => {
    const at = api.project(endpointKey(end));
    return at ? [{ key: endpointKey(end), title: end.title, at }] : [];
  });

  return (
    <div className="absolute inset-0" data-map-insights>
      <svg key={revealKey} className="absolute inset-0 h-full w-full overflow-visible">
        {shapes.map(({ mark, shape }, index) => {
          if (!shape) return null;
          const meta = MARK_META[mark.kind];
          const linked = mark.status === "linked";
          const dim = current !== null && current !== mark.id;
          const active = current === mark.id;
          const common = cn(
            "pointer-events-auto cursor-pointer transition-opacity duration-200",
            dim && "opacity-20"
          );
          const pick = () => onPick(mark.id);
          const strokeColor = linked ? "var(--tau-ink-3)" : meta.stroke;
          const glow = active
            ? { filter: "drop-shadow(0 0 3px var(--tau-accent-soft))" }
            : undefined;
          switch (shape.kind) {
            case "curve":
            case "line":
            case "wave":
              return (
                <g key={mark.id} className={common} onClick={pick} data-map-mark={mark.id}>
                  {/* 宽的透明描边当点击区 */}
                  <path d={shape.d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={shape.d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={shape.kind === "line" ? 2 : shape.kind === "wave" ? 1.4 : 1.8}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={shape.kind === "line" ? "0.012 0.02" : "1"}
                    className={shape.kind === "line" ? "animate-fadeIn" : "animate-insight-stroke"}
                    style={{ ...delay(index), ...glow }}
                  />
                  {shape.ends.map((point, i) => (
                    <circle
                      key={i}
                      cx={point.x}
                      cy={point.y}
                      r={shape.kind === "curve" ? 4.5 : 3}
                      fill={linked ? "var(--tau-ink-3)" : strokeColor}
                      className="animate-fadeIn"
                      style={delay(index)}
                    />
                  ))}
                </g>
              );
            case "chain":
              return (
                <g key={mark.id} className={common} onClick={pick} data-map-mark={mark.id}>
                  <path d={shape.d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={shape.d}
                    fill="none"
                    stroke={meta.stroke}
                    strokeWidth={1.4}
                    pathLength={1}
                    strokeDasharray="1"
                    className="animate-insight-stroke"
                    style={{ ...delay(index), ...glow }}
                  />
                  {shape.dots.map((point, i) => (
                    <circle key={i} cx={point.x} cy={point.y} r={3} fill="var(--tau-ink-2)" />
                  ))}
                  <circle
                    cx={shape.ghost.x}
                    cy={shape.ghost.y}
                    r={7}
                    fill="var(--tau-bg-surface)"
                    stroke="var(--tau-accent)"
                    strokeWidth={1.4}
                    strokeDasharray="3 2.5"
                    className="animate-insight-ring origin-center [transform-box:fill-box]"
                    style={delay(index)}
                  />
                </g>
              );
            case "rings":
              return (
                <g key={mark.id} className={common} onClick={pick} data-map-mark={mark.id}>
                  {shape.rings.map((point, i) => (
                    <g key={i}>
                      <circle cx={point.x} cy={point.y} r={14} fill="transparent" />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={10}
                        fill="none"
                        stroke={meta.stroke}
                        strokeWidth={1.5}
                        className="animate-insight-ring origin-center [transform-box:fill-box]"
                        style={{
                          animationDelay: `${DRAW_LEAD_MS + index * DRAW_STAGGER_MS + i * 150}ms`,
                          ...glow,
                        }}
                      />
                    </g>
                  ))}
                </g>
              );
            case "pin":
              return (
                <g key={mark.id} className={common} onClick={pick} data-map-mark={mark.id}>
                  <g className="animate-fadeIn" style={delay(index)}>
                    <circle
                      cx={shape.at.x}
                      cy={shape.at.y}
                      r={14}
                      fill="var(--tau-bg-surface)"
                      stroke={meta.stroke}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      className="animate-insight-breathe origin-center [transform-box:fill-box]"
                      style={glow}
                    />
                    <text
                      x={shape.at.x}
                      y={shape.at.y + 5}
                      textAnchor="middle"
                      fontSize={14}
                      fontWeight={600}
                      fill={meta.stroke}
                    >
                      ?
                    </text>
                  </g>
                </g>
              );
            case "note":
              return (
                <g key={mark.id} className={common} onClick={pick} data-map-mark={mark.id}>
                  <text
                    x={shape.at.x}
                    y={shape.at.y}
                    textAnchor="middle"
                    fontSize={12.5}
                    fill={active ? "var(--tau-accent-text)" : "var(--tau-ink-3)"}
                    stroke="var(--tau-bg-surface)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="animate-fadeIn hover:fill-[var(--tau-accent-text)]"
                    style={delay(index)}
                  >
                    ＋ {mark.text}
                  </text>
                </g>
              );
          }
        })}
        {involved.map(item => (
          <circle
            key={item.key}
            cx={item.at.x}
            cy={item.at.y}
            r={7}
            fill="none"
            stroke="var(--tau-accent)"
            strokeWidth={2}
            className="animate-insight-ring origin-center [transform-box:fill-box]"
          />
        ))}
      </svg>

      {involved.map(item => (
        <div
          key={item.key}
          className="bg-surface shadow-float text-ink-1 animate-fadeIn absolute max-w-[180px] -translate-x-1/2 -translate-y-full truncate rounded-full px-2 py-px text-[12px]"
          style={{ left: item.at.x, top: item.at.y - 11 }}
          data-map-involved={item.key}
        >
          {item.title}
        </div>
      ))}

      {/* 全局层：有发现的主题名可以点，名字后一个小点 */}
      {topics.map(topic => {
        const at = topicLabelPoint(api, topic.topicId);
        if (!at) return null;
        const width = Math.max(48, topic.label.length * 15 + 16);
        return (
          <button
            key={topic.topicId}
            type="button"
            title={`看看「${topic.label}」里的发现`}
            onClick={() => onPickTopic(topic.topicId)}
            className="hover:bg-accent-soft/60 rounded-tau-sm pointer-events-auto absolute h-7"
            style={{ left: at.x - width / 2, top: at.y - 14, width }}
            data-map-topic={topic.topicId}
          >
            <i className="bg-accent absolute -right-2 top-1/2 size-[5px] -translate-y-1/2 rounded-full opacity-80" />
          </button>
        );
      })}

      {currentAnchor && (
        <div
          ref={setAnchorEl}
          className="absolute h-0 w-0"
          style={{ left: currentAnchor.x, top: currentAnchor.y + 10 }}
        />
      )}
    </div>
  );
}
