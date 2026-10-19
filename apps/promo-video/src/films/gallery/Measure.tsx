/**
 * 点按坐标测量（静帧，不进成片）：把某一时刻的窗口按 1:1 画在左上角，渲染时在浏览器里按文字或 data-hit 找到目标，
 * 把中心点（窗口坐标）写在画面右侧（Remotion 不转发这里的 console.log）：`npx remotion still src/index.ts Measure-<key> /tmp/m.png`，再看图读数。
 * 场景里的光标 TARGET 用这里量出的数，不再从静帧估算。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { aiWindow } from "../product/scenes/AiChapter";
import { popoverSpot } from "../product/scenes/MapChapter";
import { AppWindow } from "../../app-kit/AppWindow";
import { KnowledgeMapPage, MAP_CANVAS_RECT, MAP_REPORT_WIDTH, MapCaption } from "../../app-kit/pages/KnowledgeMapPage";
import { MapInsightPopover, MapReportBody } from "../../app-kit/parts/MapInsights";
import { DEEP_STATS } from "../../mock/deepmap";
import { DAILY, MAP_CHAPTER } from "../../mock/deepwork";
import { TodosPage } from "../../app-kit/pages/TodosPage";
import { DiaryPage } from "../../app-kit/pages/DiaryPage";
import { at, P } from "../product/timeline";

type Query = { name: string; text?: string; hit?: string; nth?: number };
type Probe = { render: () => ReactNode; queries: Query[] };

export const MEASURES = {
  aiAssist: {
    render: () => aiWindow(at(P.ai.assist.send) - 2),
    queries: [
      { name: "assistButton", hit: "assist" },
      { name: "send", hit: "send" },
    ],
  },
  aiInsights: {
    render: () => aiWindow(at(P.ai.insights.popover) + 20),
    queries: [
      { name: "insightsButton", text: "退出洞见" },
      { name: "connect", text: "连接" },
      { name: "linkMark", hit: "link-mark" },
    ],
  },
  aiInsightsOff: {
    render: () => aiWindow(at(P.ai.insights.start) + 2),
    queries: [
      { name: "insightsButton", text: "AI 洞见" },
      { name: "composeToggle", text: "创作模式" },
    ],
  },
  aiComposeIntent: {
    render: () => aiWindow(at(P.ai.compose.gather) - 2),
    queries: [{ name: "gather", text: "开始找资料" }],
  },
  aiComposeLink: {
    render: () => aiWindow(at(P.ai.compose.link) - 2),
    queries: [{ name: "link", text: "连到此段" }],
  },
  aiEnd: {
    render: () => aiWindow(at(P.ai.end) - 1),
    queries: [{ name: "inlineLink", hit: "inline-link" }],
  },
  mapIdle: {
    render: () => (
      <AppWindow active="knowledge-map" mapActive crumb="知识地图">
        <KnowledgeMapPage stats={DEEP_STATS} canvasSlot={<div />} caption={<MapCaption text={`${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}`} state="hover" />} />
      </AppWindow>
    ),
    queries: [
      { name: "caption", text: `${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}` },
      { name: "insightsButton", text: "AI 洞见" },
    ],
  },
  mapPopover: {
    render: () => {
      const spot = popoverSpot(MAP_CANVAS_RECT.width - MAP_REPORT_WIDTH);
      return (
        <AppWindow active="knowledge-map" mapActive crumb="知识地图">
          <KnowledgeMapPage
            stats={DEEP_STATS}
            report={1}
            insightButton="on"
            reportBody={<MapReportBody content={MAP_CHAPTER.report} reading={false} appear={1} />}
            canvasSlot={
              <div className="relative h-full w-full">
                <div className="absolute" style={{ left: spot.left, top: spot.top }}>
                  <MapInsightPopover {...MAP_CHAPTER.popover} />
                </div>
              </div>
            }
          />
        </AppWindow>
      );
    },
    queries: [{ name: "connect", text: "连接" }],
  },
  dailyTodos: {
    render: () => (
      <AppWindow active="todos">
        <TodosPage groups={DAILY.todos.groups} summary={DAILY.todos.summary} fold={{ now: "15:56" }} checking={{ title: DAILY.todo, t: 0 }} />
      </AppWindow>
    ),
    queries: [{ name: "check", hit: `todo-check:${DAILY.todo}` }],
  },
  dailyDiary: {
    render: () => (
      <AppWindow active="diary">
        <DiaryPage summary={DAILY.diary.summary} days={DAILY.diary.days} months={DAILY.diary.months} now={DAILY.diary.now} draft={DAILY.diary.typed} />
      </AppWindow>
    ),
    queries: [
      { name: "input", hit: "diary-input" },
      { name: "send", hit: "diary-send" },
    ],
  },
} satisfies Record<string, Probe>;

export type MeasureKey = keyof typeof MEASURES;

function findTarget(root: HTMLElement, q: Query) {
  if (q.hit) return root.querySelectorAll<HTMLElement>(`[data-hit="${q.hit}"]`)[q.nth ?? 0];
  // 取文字完全匹配的最内层元素
  const all = [...root.querySelectorAll<HTMLElement>("*")].filter(el => el.textContent?.trim() === q.text && ![...el.children].some(c => c.textContent?.trim() === q.text));
  return all[q.nth ?? 0];
}

export function Measure({ probe }: { probe: MeasureKey }) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender(`测量 ${probe}`));
  const [result, setResult] = useState<string[]>([]);
  const { render, queries } = MEASURES[probe] as Probe;
  useEffect(() => {
    const timer = setTimeout(() => {
      const root = ref.current!;
      const box = root.getBoundingClientRect();
      const out: Record<string, unknown> = {};
      for (const q of queries) {
        const el = findTarget(root, q);
        if (!el) {
          out[q.name] = null;
          continue;
        }
        const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
        out[q.name] = { x: Math.round(r.left - box.left + r.width / 2), y: Math.round(r.top - box.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      }
      setResult(Object.entries(out).map(([k, v]) => `${k}: ${v ? JSON.stringify(v) : "未找到"}`));
      requestAnimationFrame(() => continueRender(handle));
    }, 300);
    return () => clearTimeout(timer);
  }, [handle, probe, queries]);
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <div ref={ref} style={{ position: "absolute", left: 0, top: 0 }}>
        {render()}
      </div>
      <div style={{ position: "absolute", left: 1800, top: 40, width: 760, font: "28px/1.6 monospace", color: "#000", whiteSpace: "pre-wrap" }}>{result.join("\n")}</div>
    </AbsoluteFill>
  );
}
