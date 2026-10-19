/**
 * 收尾（曲内第 82 小节到曲末）：镜头从访达拉远，全片用过的窗口在画布上铺开 → 第 84 小节涌起时窗口碎成光点（一条条笔记）→
 * 光点向外让出中间，浮出整屏宣言「从下一个想法开始。」→ 第 86–88 小节光点汇成「图标 + Tau」字标（与开场首尾呼应）→
 * slogan → 第 90 小节「免费下载，不用注册 | taunote.app」，随曲尾衰减停住。
 * 世界坐标沿用插件段：Tau 窗口居中于原点，访达在 (260, 150)；其余窗口按 5 × 4 的格子摆在它四周。
 */
import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { ease, mix, mixColor, progress } from "../../../brand/motion";
import { fonts } from "../../../brand/tokens";
import { cameraAt, inView, Place, project, World, type CameraState, type Shot } from "../../../kit/Camera";
import { ManifestoText } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { RevealText } from "../../../kit/RevealText";
import { useStage } from "../../../kit/Stage";
import { TauMark } from "../../../kit/TauMark";
import { useTextPoints, type GlyphText } from "../../../kit/textPoints";
import { AppWindow, WINDOW } from "../../../app-kit/AppWindow";
import { WeReadPage } from "../../../app-kit/pages/WeReadPage";
import { FinderWindow } from "../../../app-kit/pages/FinderWindow";
import { Toast } from "../../../app-kit/parts/Toast";
import { WindowLayer } from "../../../app-kit/parts/WindowLayer";
import { FINDER_ROWS, PLUGINS } from "../../../mock/deepwork";
import { GALLERY_PAGES, type GalleryPage } from "../../gallery/Gallery";
import { ENDING, PLUGIN_TAGS, SLOGAN, URL } from "../copy";
import { beat, BEAT_SEC, f, P } from "../timeline";
import { aiWindow } from "./AiChapter";
import { nearestPairs } from "./Opening";
import { ArticleWindow } from "./WriteChapter";

const CELL = { w: 1600, h: 1020 };
/**
 * 全片窗口墙（按出场顺序从左上读起，每个模块只出现一次）：5 列 × 4 行，插件段的书架窗口在第 3 行正中，即世界原点。
 * 写作 白板 数据库 划线 Notebook / 卡片 闪卡 发布 小管家 洞见 / 创作模式 知识地图 微信读书 番茄 待办 / 日程 日记 今日 插件中心 导入与导出
 */
const WALL: (GalleryPage | "article" | "shelf" | "compose")[][] = [
  ["article", "board", "dbTable", "browser", "notebook"],
  ["loopCard", "loopReview", "publishDone", "assist", "insights"],
  ["compose", "deepMapInsight", "shelf", "dailyPomodoro", "dailyTodos"],
  ["dailySchedule", "dailyDiary", "dailyToday", "plugins", "settingsTransfer"],
];
const WALL_CELLS = WALL.flatMap((row, r) => row.map((id, c) => ({ id, col: c - 2, row: r - 2, x: (c - 2) * CELL.w, y: (r - 2) * CELL.h })));
/** 看全窗口墙的机位 */
const WALL_VIEW: CameraState = { x: 0, y: -510, zoom: 0.235 };
const FINDER = { x: 260, y: 150 };
/** 插件段结束机位 */
const PLUGIN_END: CameraState = { x: FINDER.x - 50, y: FINDER.y - 40, zoom: 1.18 };

const AI_WIDE = { width: 1760, height: 990 };
const WEREAD_NAV = { item: { key: "plugin:weread", label: "微信读书", icon: BookOpen }, appear: 1 };

function WallWindow({ id }: { id: (typeof WALL)[number][number] }) {
  if (id === "article") return <ArticleWindow />;
  if (id === "compose") {
    // 创作模式窗口在片中拉宽到 1760×990，这里等比缩回 1440 宽，免得挤到相邻格
    const scale = WINDOW.width / AI_WIDE.width;
    return (
      <div style={{ width: WINDOW.width, height: AI_WIDE.height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>{aiWindow(f(beat(P.ai.end)) - 1)}</div>
      </div>
    );
  }
  if (id === "shelf") {
    return (
      <AppWindow active="plugin:weread" pluginNav={WEREAD_NAV}>
        <WeReadPage state={{ kind: "shelf", appear: 1 }} />
      </AppWindow>
    );
  }
  const Page = GALLERY_PAGES[id];
  return <Page />;
}

/** 字标排版：图标 200 + 间距 48 + 「Tau」字面约 460 宽，整体在画面水平居中、视觉中心 y = 430 */
const ICON = { size: 200, x: 606, y: 330 };
const GLYPH: GlyphText = { text: "Tau", font: '"Noto Serif SC Variable", serif', size: 260, width: 700, height: 320, baseline: 250 };
const GLYPH_ORIGIN = { x: 1084 - GLYPH.width / 2, y: 521 - GLYPH.baseline };
const MARK_SPAN = { from: ICON.x, to: GLYPH_ORIGIN.x + GLYPH.width / 2 + 230 };
const DOTS_PER_WINDOW = 28;
const ICON_DOTS = 120;

type Dot = { wx: number; wy: number; tx: number; ty: number; r: number; delay: number; phase: number; cell: number };

export function EndingChapter() {
  const frame = useCurrentFrame();
  const stage = useStage();
  const E = P.ending;
  const [s84, s86, s88, s90] = E.swell;
  const B = BEAT_SEC;
  const total = WALL_CELLS.length * DOTS_PER_WINDOW;
  const glyphPoints = useTextPoints(GLYPH, total - ICON_DOTS, 5);

  // —— 镜头：2 小节拉远看全窗口墙，涌起前后再缓缓推近一点，之后停住
  const shots: Shot[] = [
    { at: f(E.start), ...PLUGIN_END },
    { at: f(E.start + 4.5 * B), ...WALL_VIEW, ease: ease.inOut },
    { at: f(s84 + 2 * B), ...WALL_VIEW, zoom: WALL_VIEW.zoom * 1.04, ease: ease.soft },
  ];
  const camera = cameraAt(frame, shots);
  const restCamera = shots[shots.length - 1];

  const dots = useMemo<Dot[] | null>(() => {
    if (!glyphPoints) return null;
    return WALL_CELLS.flatMap((_, k) =>
      Array.from({ length: DOTS_PER_WINDOW }, (_, i) => {
        const n = k * DOTS_PER_WINDOW + i;
        // 前 ICON_DOTS 个（随机挑）落进图标的圆角方块，其余织成「Tau」
        const order = Math.floor(random(`eo${n}`) * 1e6);
        return { n, order, k };
      })
    )
      .sort((a, b) => a.order - b.order)
      .map(({ n, k }, rank) => {
        const cell = WALL_CELLS[k];
        const toIcon = rank < ICON_DOTS;
        const g = toIcon ? null : glyphPoints[(rank - ICON_DOTS) % glyphPoints.length];
        return {
          wx: cell.x + (random(`ex${n}`) - 0.5) * WINDOW.width * 0.8,
          wy: cell.y + (random(`ey${n}`) - 0.5) * WINDOW.height * 0.8,
          tx: g ? GLYPH_ORIGIN.x + g.x : ICON.x + 18 + random(`ix${n}`) * (ICON.size - 36),
          ty: g ? GLYPH_ORIGIN.y + g.y : ICON.y + 18 + random(`iy${n}`) * (ICON.size - 36),
          r: 1.8 + random(`er${n}`) * 2.4,
          delay: random(`ed${n}`) * 0.35,
          phase: random(`ep${n}`) * Math.PI * 2,
          cell: k,
        };
      })
      .sort((a, b) => a.cell - b.cell);
  }, [glyphPoints]);

  // 光点散开后的落点（屏幕坐标）：从停住的机位投影，再向外推开，给宣言让出中间
  const spreadTargets = useMemo(
    () =>
      dots?.map(d => {
        const s = project(restCamera, d.wx, d.wy);
        const dx = s.x - 960;
        const dy = s.y - 540;
        const push = 1.22 + 0.3 * Math.max(0, 1 - Math.hypot(dx, dy) / 520);
        return { x: 960 + dx * push, y: 540 + dy * push };
      }) ?? [],
    [dots, restCamera]
  );
  const scatterLinks = useMemo(() => nearestPairs(spreadTargets, 2, 120), [spreadTargets]);
  const glyphLinks = useMemo(
    () =>
      dots
        ? nearestPairs(
            dots.map(d => ({ x: d.tx, y: d.ty })),
            2,
            20
          )
        : [],
    [dots]
  );
  if (!dots) return null;

  // —— 窗口：拉远时由近及远浮现；第 84 小节涌起前后缩小、淡出，碎成光点
  const dissolve = progress(frame, f(s84), f(2.5 * B), ease.inOut);
  const toastOut = 1 - progress(frame, f(E.start), 18);
  const finderAlpha = 1 - dissolve;

  // —— 光点
  const emerge = progress(frame, f(s84 - 0.25 * B), f(2 * B), ease.out);
  const spread = progress(frame, f(s84 + B), f(2.5 * B), ease.inOut);
  const convergeStart = f(s86 - 0.25 * B);
  const convergeSpan = f(s88 - 0.75 * B) - convergeStart;
  const solid = progress(frame, f(s88) - 30, 50, ease.inOut);
  const t = frame / 60;

  const pos = dots.map((d, i) => {
    const base = project(camera, d.wx, d.wy);
    const sx = mix(base.x, spreadTargets[i].x, spread);
    const sy = mix(base.y, spreadTargets[i].y, spread);
    const c = progress(frame, convergeStart + d.delay * convergeSpan * 0.6, convergeSpan * 0.7, ease.inOut);
    const float = spread * (1 - c);
    return {
      x: mix(sx + Math.sin(t * 1.3 + d.phase) * 16 * float, d.tx, c),
      y: mix(sy + Math.cos(t * 1.1 + d.phase) * 11 * float, d.ty, c),
      c,
    };
  });
  const colorAt = (x: number, c: number) => mixColor(stage.brand[0], stage.brand[1], Math.min(1, Math.max(0, mix(x / 1920, (x - MARK_SPAN.from) / (MARK_SPAN.to - MARK_SPAN.from), c))));
  const scatterLinkAlpha = progress(frame, f(s84 + 2 * B), f(1.5 * B)) * (1 - progress(frame, convergeStart, 24));
  const dotsAlpha = emerge * (1 - solid * 0.92);

  // —— 字标与文字
  const icon = progress(frame, f(s88) - 12, 30, ease.out);
  const glow = icon * (1 - progress(frame, f(s88) + 30, 60));
  const download = progress(frame, f(s90), 30, ease.out);
  // 字标落定后整体极缓地推近，画面不至于死停
  const settle = 1.03 - 0.03 * progress(frame, f(s86), f(E.end - s86), ease.out);

  return (
    <AbsoluteFill>
      {dissolve < 1 && (
        <World shots={[{ at: 0, ...camera }]}>
          {WALL_CELLS.map(({ id, col, row, x, y }) => {
            const ring = Math.max(Math.abs(col), Math.abs(row));
            const appear = ring === 0 ? 1 : progress(frame, f(E.start + (0.25 + ring * 0.6) * B), f(1.5 * B), ease.out);
            const alpha = appear * (1 - dissolve);
            if (alpha <= 0.01 || !inView(camera, x, y, WINDOW.width, WINDOW.height, 0)) return null;
            const scale = (0.94 + 0.06 * appear) * (1 - 0.4 * dissolve);
            return (
              <Place key={id} x={x} y={y} style={{ transform: `translate(-50%, -50%) scale(${scale})`, opacity: alpha }}>
                <div className="relative" style={{ width: WINDOW.width, height: WINDOW.height }}>
                  <WallWindow id={id} />
                  {id === "shelf" && toastOut > 0 && (
                    <WindowLayer>
                      <Toast message={`已导出 ${PLUGINS.export.total} 篇 · ${PLUGINS.export.assets.toLocaleString("en-US")} 个资源`} appear={toastOut} />
                    </WindowLayer>
                  )}
                </div>
              </Place>
            );
          })}
          {finderAlpha > 0.01 && (
            <Place x={FINDER.x} y={FINDER.y} style={{ transform: `translate(-50%, -50%) scale(${1 - 0.4 * dissolve})`, opacity: finderAlpha }}>
              <FinderWindow rows={FINDER_ROWS} selected={1} />
            </Place>
          )}
        </World>
      )}

      <AbsoluteFill style={{ transform: `scale(${settle})`, transformOrigin: "960px 470px" }}>
        {dotsAlpha > 0 && (
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <defs>
              <filter id="end-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            <g opacity={dotsAlpha}>
              {scatterLinkAlpha > 0 &&
                scatterLinks.map(([a, b], i) => (
                  <line key={`s${i}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke={colorAt(pos[a].x, 0)} strokeOpacity={0.28 * scatterLinkAlpha} strokeWidth={1} />
                ))}
              {glyphLinks.map(([a, b], i) => (
                <line
                  key={`g${i}`}
                  x1={pos[a].x}
                  y1={pos[a].y}
                  x2={pos[b].x}
                  y2={pos[b].y}
                  stroke={colorAt(pos[a].x, 1)}
                  strokeOpacity={0.5 * Math.max(0, pos[a].c * pos[b].c - 0.5) * 2}
                  strokeWidth={1.2}
                />
              ))}
              <g filter="url(#end-dot-glow)" opacity={0.6}>
                {pos.map((p, i) => (
                  <circle key={`h${i}`} cx={p.x} cy={p.y} r={dots[i].r * 1.8} fill={colorAt(p.x, p.c)} />
                ))}
              </g>
              {pos.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={dots[i].r * (0.4 + 0.6 * emerge) * (1 - 0.3 * p.c)} fill={colorAt(p.x, p.c)} />
              ))}
            </g>
          </svg>
        )}

        {solid > 0 && (
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: solid }}>
            <defs>
              <linearGradient id="end-brand" x1={GLYPH_ORIGIN.x + 120} x2={GLYPH_ORIGIN.x + GLYPH.width - 120} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={stage.brand[0]} />
                <stop offset="100%" stopColor={stage.brand[1]} />
              </linearGradient>
            </defs>
            <text x={GLYPH_ORIGIN.x + GLYPH.width / 2} y={GLYPH_ORIGIN.y + GLYPH.baseline} textAnchor="middle" fontFamily={GLYPH.font} fontSize={GLYPH.size} fill="url(#end-brand)">
              {GLYPH.text}
            </text>
          </svg>
        )}
        {icon > 0 && (
          <div style={{ position: "absolute", left: ICON.x, top: ICON.y, opacity: icon, transform: `scale(${0.85 + 0.15 * icon})`, transformOrigin: "50% 50%" }}>
            <TauMark size={ICON.size} glow={glow} />
          </div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, top: 600, textAlign: "center", fontFamily: fonts.display, fontWeight: 600, fontSize: 54, letterSpacing: "0.18em", color: stage.ink }}>
          <RevealText text={SLOGAN} startAt={f(s88 + B)} stagger={3} />
        </div>
        {download > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 738,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
              opacity: download,
              transform: `translateY(${(1 - download) * 14}px)`,
            }}
          >
            <span style={{ fontFamily: fonts.caption, fontSize: 28, letterSpacing: "0.2em", color: stage.ink2 }}>{ENDING.free}</span>
            <span style={{ width: 1, height: 26, background: stage.ink3 }} />
            <span style={{ fontFamily: fonts.label, fontSize: 30, letterSpacing: "0.06em", color: stage.brand[0] }}>{URL}</span>
          </div>
        )}
      </AbsoluteFill>

      <ModuleTag module={PLUGIN_TAGS[2].module} feature={PLUGIN_TAGS[2].feature} at={-1e9} out={f(E.start + 1.5 * B)} />
      <ManifestoText text={ENDING.start} at={f(s84 + 1.5 * B)} out={f(s86)} size={120} />
    </AbsoluteFill>
  );
}
