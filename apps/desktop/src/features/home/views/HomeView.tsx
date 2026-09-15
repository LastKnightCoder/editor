/**
 * 今日（首页）视图 v3 —— 行式单列流（mockups/home-final.html 定稿）：
 * hero 条 → 行动三卡（复习/待办/日程，内容等量）→ 继续编辑（全宽三栏）→
 * 热力图（直接复用旧 CalendarHeatmap）→ 统计四卡（sparkline）。
 *
 * 模块分工：专注 = 番茄钟（openPomodoroWindow 独立窗口 / pomodoro 命令）；
 * 日程 = calendar 命令 + schedule surface。两者独立，勿混用。
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { openPomodoroWindow } from "@/commands";
import { useSurface } from "@/surface/SurfaceProvider";
import { useEdgeFade } from "@/hooks/useEdgeFade";
import { useHomeSnapshot, minutesToHM } from "../queries";
import { HomeHeatmap } from "./HomeHeatmap";
import type { RecentEdit } from "../types";
import "../home.css";

const KIND_LABEL = {
  card: "卡片",
  article: "文章",
  diary: "日记",
  document: "知识库",
  project: "项目",
} as const;
const KIND_TARGET = {
  card: "cards",
  article: "articles",
  diary: "diary",
  document: "library",
  project: "projects",
} as const;

export function HomeView() {
  const { data, loading } = useHomeSnapshot();
  const { navigator } = useSurface();
  // callback ref（非 useRef）：loading 早退分支下滚动容器晚于首帧挂载，
  // 经 state 触发 useEdgeFade 在挂载后重新接线
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  if (loading) {
    return (
      <div className="wide">
        <p className="hero-date">加载中…</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="wide home-view" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ① hero 紧凑条（专注摘要可点击打开番茄钟） */}
      <header className="home-hero-line">
        <h1>{greeting()}</h1>
        <span className="date">{formatToday()}</span>
        <span className="digest">
          <button
            type="button"
            title="打开番茄钟"
            onClick={() => openPomodoroWindow()}
            style={{ font: "inherit", color: "inherit" }}
          >
            已专注 <b>{minutesToHM(data.focus.focusMinutes)}</b>
          </button>
          <span className="sep">·</span>写下 <b>{data.todayStats.wordsWritten}</b> 字
          <span className="sep">·</span>新建{" "}
          <b>{data.todayStats.cardsCreated + data.todayStats.articlesCreated}</b> 条
        </span>
      </header>

      {/* 滚动区：hero 固定于滚动区外（渐隐带直接作用于内容，不被容器 padding 稀释），
          边缘渐隐由 useEdgeFade 驱动（.home-scroll 的 mask 渐变，见 home.css） */}
      <div ref={setScrollEl} className="home-scroll">
        {/* ②③④ 行动三卡（“前往”箭头在标题行右缘） */}
        <div className="home-row trio">
          <section className="board">
            <h2 className="board-title">
              复习
              <small>{data.reviewDecks.filter(d => d.dueCount > 0).length} 个牌组有到期</small>
              <button
                type="button"
                className="act-link"
                onClick={() => navigator.push("review")}
                title="前往闪卡复习"
              >
                前往复习
                <ChevronRight />
              </button>
            </h2>
            {data.reviewDecks.length > 0 ? (
              data.reviewDecks.map(deck => (
                <div key={deck.id} className="deck-row">
                  <span className="name" title={deck.name}>
                    {deck.name}
                  </span>
                  <span className="track">
                    <i
                      style={{
                        width:
                          deck.totalCards > 0
                            ? `${(deck.dueCount / deck.totalCards) * 100}%`
                            : "0%",
                      }}
                    />
                  </span>
                  <span className="n">
                    <b>{deck.dueCount}</b>/{deck.totalCards}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="还没有闪卡牌组" />
            )}
          </section>

          <section className="board">
            <h2 className="board-title">
              待办
              <small>{data.todoRemainingCount} 项未完成</small>
              <button
                type="button"
                className="act-link"
                onClick={() => navigator.push("schedule")}
                title="前往待办"
              >
                前往待办
                <ChevronRight />
              </button>
            </h2>
            {data.todos.length > 0 ? (
              data.todos.map(todo => (
                <button
                  key={todo.id}
                  type="button"
                  className="todo-item"
                  onClick={() => navigator.push("schedule")}
                >
                  <span
                    className="check"
                    style={todo.overdue ? { borderColor: "var(--tau-danger)" } : undefined}
                  />
                  <span>
                    <b>{todo.title}</b>
                    <small style={todo.overdue ? { color: "var(--tau-danger)" } : undefined}>
                      {todo.overdue ? `逾期 · ${todo.dueText ?? ""}` : (todo.dueText ?? "待办")}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <Empty text="没有待办事项" />
            )}
          </section>

          <section className="board">
            <h2 className="board-title">
              日程
              <small>今天 {data.events.length} 项</small>
              <button
                type="button"
                className="act-link"
                onClick={() => navigator.push("schedule")}
                title="前往日程"
              >
                前往日程
                <ChevronRight />
              </button>
            </h2>
            {data.events.length > 0 ? (
              <div className="timeline">
                {data.events.map(event => (
                  <div key={event.id} className="tl-item">
                    <span className="time">{event.timeText}</span>
                    <span className="label">{event.title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="今天没有日程安排" />
            )}
          </section>
        </div>

        {/* ⑤ 最近编辑：全宽三栏（卡片/文章/日记/知识库/项目） */}
        <section className="board">
          <h2 className="board-title">
            最近编辑
            <small>卡片 · 文章 · 日记 · 知识库 · 项目</small>
          </h2>
          <div className="home-recent-grid">
            {data.recentEdits.length > 0 ? (
              data.recentEdits.map(item => (
                <RecentRow
                  key={item.id}
                  item={item}
                  onClick={() => navigator.push(KIND_TARGET[item.kind])}
                />
              ))
            ) : (
              <Empty text="还没有编辑记录——从新建一张卡片开始" />
            )}
          </div>
        </section>

        {/* ⑥ 活动热力图（模板 1:1 自绘；无图例与角标） */}
        <section className="board">
          <h2 className="board-title">
            活动
            <small>{new Date().getFullYear()} 年 · 每日操作</small>
            <button
              type="button"
              className="act-link"
              onClick={() => navigator.push("stats")}
              title="查看完整统计"
            >
              完整统计
              <ChevronRight />
            </button>
          </h2>
          <HomeHeatmap items={data.heatmapItems} />
        </section>

        {/* ⑦-⑩ 统计四卡（sparkline；与其他卡同构，不放按钮） */}
        <div className="stat-row">
          <section className="board stat-card">
            <div className="head">
              <span className="label">今日专注</span>
              <span className="val">{data.focus.sessionCount} 番茄</span>
            </div>
            <b>{minutesToHM(data.focus.focusMinutes)}</b>
            <Sparkline dates={data.trend.dates} values={data.trend.focusMinutes} unit="分钟" />
          </section>
          <section className="board stat-card">
            <div className="head">
              <span className="label">今日写下</span>
              <span className="val">本周 {data.weekly.wordsWritten}</span>
            </div>
            <b>
              {data.todayStats.wordsWritten}
              <small>字</small>
            </b>
            <Sparkline dates={data.trend.dates} values={data.trend.words} unit="字" />
          </section>
          <section className="board stat-card">
            <div className="head">
              <span className="label">本周新建</span>
              <span className="val">
                卡片 {data.weekly.cardsCreated} · 文章 {data.weekly.articlesCreated}
              </span>
            </div>
            <b>
              {data.weekly.cardsCreated + data.weekly.articlesCreated}
              <small>条</small>
            </b>
            <Sparkline dates={data.trend.dates} values={data.trend.created} unit="条" tint />
          </section>
          <section className="board stat-card">
            <div className="head">
              <span className="label">累计</span>
              <span className="val">日记 {data.totals.diaries}</span>
            </div>
            <b>
              {data.totals.cards + data.totals.articles}
              <small>条</small>
            </b>
            <Sparkline dates={data.trend.dates} values={data.trend.words} unit="字" tint />
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------- 域内私有组件 ---------- */

function RecentRow({ item, onClick }: { item: RecentEdit; onClick: () => void }) {
  return (
    <button type="button" className="home-doc-row" onClick={onClick}>
      <span className="k">{KIND_LABEL[item.kind]}</span>
      <span className="t">{item.title}</span>
      <span className="m">
        {item.updatedText}
        {item.wordsCount > 0 ? ` · ${item.wordsCount} 字` : ""}
      </span>
    </button>
  );
}

function Sparkline({
  dates,
  values,
  unit,
  tint,
}: {
  dates: string[];
  values: number[];
  unit: string;
  tint?: boolean;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className={`spark${tint ? "tint" : ""}`}>
      {values.map((v, i) => (
        <i
          key={i}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
          className={i === values.length - 1 ? "today" : undefined}
          title={`${dates[i]} · ${v} ${unit}`}
        />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p
      className="board-note"
      style={{ background: "var(--tau-bg-group)", color: "var(--tau-ink-3)" }}
    >
      {text}
    </p>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
