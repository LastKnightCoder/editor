/**
 * 「一天」的无限画布：各页面窗口摆在世界坐标上，镜头一镜到底地穿行；
 * 收尾拉远成全景、窗口逐个入夜（切深色）、再收拢成光点，交给星图场景。
 */
import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { cameraAt, inView, Place, World, type Shot } from "../../../kit/Camera";
import { Cursor, type CursorStop } from "../../../kit/Cursor";
import { AppWindow, WINDOW } from "../../../app-kit/AppWindow";
import { TodayPage } from "../../../app-kit/pages/TodayPage";
import { PdfReaderPage } from "../../../app-kit/pages/PdfReaderPage";
import { CardEditorPage, cardTimings } from "../../../app-kit/pages/CardEditorPage";
import { ReviewPage } from "../../../app-kit/pages/ReviewPage";
import { PomodoroPage } from "../../../app-kit/pages/PomodoroPage";
import { SchedulePage } from "../../../app-kit/pages/SchedulePage";
import { TodosPage } from "../../../app-kit/pages/TodosPage";
import { AssistDock } from "../../../app-kit/parts/AssistDock";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import type { NavKey } from "../../../app-kit/navigation";
import { AI_CHAT, CARD_SCRIPT } from "../../../mock/day";
import { f, T } from "../timeline";

export const POS = {
  today: [0, 0],
  pdf: [1800, 0],
  card: [3600, 0],
  review: [5400, 0],
  pomodoro: [900, 1150],
  schedule: [2700, 1150],
  todos: [4500, 1150],
} as const;
type WindowKey = keyof typeof POS;

/** 入夜（切深色）与收拢的先后次序 */
const ORDER: WindowKey[] = ["today", "pdf", "pomodoro", "card", "schedule", "review", "todos"];

const OVERVIEW = { x: 2700, y: 575, zoom: 0.27 };

export const SHOTS: Shot[] = [
  { at: 0, x: 0, y: 40, zoom: 0.62 },
  { at: f(4.0), x: 0, y: 40, zoom: 0.64 },
  { at: f(T.today.arrive), x: 0, y: 0, zoom: 1.12 },
  { at: f(T.today.leave), x: 0, y: 10, zoom: 1.15, ease: ease.soft },
  { at: f(T.pdf.arrive), x: POS.pdf[0], y: 0, zoom: 1.12, dip: 0.32 },
  { at: f(T.pdf.push), x: 2030, y: -90, zoom: 1.75 },
  { at: f(T.pdf.annotation), x: 2010, y: -95, zoom: 1.78, ease: ease.soft },
  { at: f(T.pdf.pullToList), x: 1640, y: -170, zoom: 1.32 },
  { at: f(T.pdf.leave), x: 1650, y: -165, zoom: 1.34, ease: ease.soft },
  { at: f(T.card.arrive), x: POS.card[0], y: 0, zoom: 1.12, dip: 0.32 },
  { at: f(T.card.push), x: 3711, y: -200, zoom: 1.5 },
  { at: f(27), x: 3711, y: -150, zoom: 1.52, ease: ease.soft },
  { at: f(T.ai.open - 0.4), x: 3711, y: -90, zoom: 1.48, ease: ease.soft },
  { at: f(33.0), x: 3690, y: 0, zoom: 1.08 },
  { at: f(T.ai.draft), x: 4060, y: 20, zoom: 1.32 },
  { at: f(T.ai.answer[0]), x: 4060, y: 30, zoom: 1.34, ease: ease.soft },
  { at: f(40.6), x: 4060, y: 60, zoom: 1.3, ease: ease.soft },
  { at: f(T.review.arrive), x: POS.review[0], y: 0, zoom: 1.12, dip: 0.3 },
  { at: f(T.overview.pull[0]), x: POS.review[0], y: 30, zoom: 1.2, ease: ease.soft },
  { at: f(T.overview.pull[1]), ...OVERVIEW, ease: ease.inOut },
  { at: f(T.stars.start + 1), x: OVERVIEW.x, y: OVERVIEW.y, zoom: 0.25, ease: ease.soft },
];

const PDF_CURSOR: CursorStop[] = [
  { at: f(13.8), x: 1120, y: 480 },
  { at: f(T.pdf.drag[0]), x: 946, y: 343 },
  { at: f(T.pdf.drag[1]), x: 752, y: 381 },
  { at: f(T.pdf.pickColor), x: 795, y: 298, click: true },
  { at: f(18.0), x: 600, y: 330 },
  { at: f(T.pdf.convertHover + 0.5), x: 474, y: 197 },
  { at: f(T.pdf.convertClick), x: 474, y: 197, click: true },
];

const REVIEW_CURSOR: CursorStop[] = [
  { at: f(44.0), x: 1010, y: 690 },
  { at: f(T.review.rate - 0.1), x: 922, y: 802 },
  { at: f(T.review.rate), x: 922, y: 802, click: true },
];

function windowContent(key: WindowKey, frame: number, mode: "light" | "dark"): { active: NavKey; crumb?: ReactNode; body: ReactNode; assist?: ReactNode; assistOpen?: boolean; overlay?: ReactNode } {
  switch (key) {
    case "today": {
      const ring = T.today.rings.findIndex(at => frame >= f(at) && frame < f(at + 1.05));
      return {
        active: "home",
        body: <TodayPage greeting={mode === "dark" ? "晚上好" : "早上好"} doneTodos={mode === "dark" ? 3 : 0} highlightPanel={(["review", "todos", "events"] as const)[ring]} />,
      };
    }
    case "pdf":
      return {
        active: "pdfs",
        crumb: <CardCrumb section="PDF" title="延展心智" />,
        body: (
          <PdfReaderPage
            highlight={progress(frame, f(T.pdf.drag[0]) + 6, f(T.pdf.drag[1] - T.pdf.drag[0]), ease.inOut)}
            toolbar={progress(frame, f(T.pdf.toolbar), 14) * (1 - progress(frame, f(T.pdf.toolbarHide), 12))}
            annotation={progress(frame, f(T.pdf.annotation), 30)}
            convertHover={progress(frame, f(T.pdf.convertHover), 16)}
          />
        ),
        overlay: <Cursor path={PDF_CURSOR} visibleFrom={f(13.8)} visibleTo={f(T.pdf.leave)} />,
      };
    case "card": {
      const t = frame - f(T.card.typingStart);
      const { linkAt } = cardTimings();
      const picker = progress(t, linkAt + 20, 12) * (1 - progress(t, CARD_SCRIPT.claim.linkedAt - 6, 6));
      const open = progress(frame, f(T.ai.open), 36, ease.out);
      const tools = T.ai.tools.map(([a, b]) => (frame < f(a) ? 0 : frame >= f(b) ? 1 : 0.2 + 0.79 * progress(frame, f(a), f(b - a))));
      const draftCount = Math.max(0, Math.min([...AI_CHAT.ask].length, Math.floor((frame - f(T.ai.draft)) / 3)));
      return {
        active: "cards",
        crumb: <CardCrumb title={CARD_SCRIPT.heading.text} />,
        body: <CardEditorPage t={t} linkPicker={picker} />,
        assistOpen: open > 0.5,
        assist:
          open > 0 ? (
            <AssistDock
              open={open}
              reveal={{
                user: progress(frame, f(T.ai.send) + 4, 20),
                tools,
                answer: progress(frame, f(T.ai.answer[0]), f(T.ai.answer[1] - T.ai.answer[0]), ease.soft),
                draft: frame >= f(T.ai.draft) && frame < f(T.ai.send) ? [...AI_CHAT.ask].slice(0, draftCount).join("") : undefined,
              }}
            />
          ) : undefined,
      };
    }
    case "review":
      return {
        active: "review",
        body: <ReviewPage flipped={progress(frame, f(T.review.flip), 30)} pressed={frame >= f(T.review.rate) ? 3 : undefined} />,
        overlay: <Cursor path={REVIEW_CURSOR} visibleFrom={f(44.0)} visibleTo={f(45.8)} />,
      };
    case "pomodoro":
      return { active: "pomodoro", body: <PomodoroPage elapsed={420 + frame / 60} /> };
    case "schedule":
      return { active: "schedule", body: <SchedulePage nowHour={mode === "dark" ? 22 : 19.5} /> };
    case "todos":
      return { active: "todos", body: <TodosPage doneCount={3} /> };
  }
}

function DayWindow({ id, frame, mode }: { id: WindowKey; frame: number; mode: "light" | "dark" }) {
  const c = windowContent(id, frame, mode);
  return (
    <div style={{ position: "relative", width: WINDOW.width, height: WINDOW.height }}>
      <AppWindow mode={mode} active={c.active} crumb={c.crumb} assist={c.assist} assistOpen={c.assistOpen}>
        {c.body}
      </AppWindow>
      {mode === "light" && c.overlay}
    </div>
  );
}

export function DayWorld() {
  const frame = useCurrentFrame();
  const rise = progress(frame, f(T.prologue.windowRise), f(2.0), ease.out);
  return (
    <World shots={SHOTS}>
      {camera =>
        (Object.keys(POS) as WindowKey[]).map(id => {
          const [x, y] = POS[id];
          if (!inView(camera, x, y, WINDOW.width, WINDOW.height)) return null;
          const order = ORDER.indexOf(id);
          const dark = progress(frame, f(T.overview.dark + order * 0.45), 36, ease.inOut);
          const collapse = progress(frame, f(T.overview.collapse[0]) + order * 5, f(1.4), ease.in);
          if (collapse >= 1) return null;
          const isToday = id === "today";
          const reveal = isToday ? rise : progress(frame, f(T.today.leave - 0.6), f(0.8));
          const opacity = reveal * (1 - progress(collapse, 0.55, 0.45, ease.out));
          if (opacity <= 0) return null;
          return (
            <Place
              key={id}
              x={x}
              y={y + (isToday ? (1 - rise) * 160 : 0)}
              style={{
                opacity,
                transform: `translate(-50%, -50%) scale(${1 - collapse * 0.97})`,
              }}
            >
              <div style={{ position: "relative" }}>
                {dark < 1 && <DayWindow id={id} frame={frame} mode="light" />}
                {dark > 0 && (
                  <div style={{ position: dark < 1 ? "absolute" : "relative", inset: 0, opacity: dark }}>
                    <DayWindow id={id} frame={frame} mode="dark" />
                  </div>
                )}
              </div>
            </Place>
          );
        })
      }
    </World>
  );
}

/** 星图场景接棒用：各窗口收拢后的画面坐标与收拢时刻 */
export function collapsePoints() {
  return ORDER.map((id, i) => {
    const [x, y] = POS[id];
    const at = f(T.overview.collapse[0]) + i * 5 + f(1.0);
    const camera = cameraAt(at, SHOTS);
    return { id, at, x: 960 + (x - camera.x) * camera.zoom, y: 540 + (y - camera.y) * camera.zoom };
  });
}
