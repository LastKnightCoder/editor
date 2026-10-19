/**
 * All in one（曲内第 66–74 小节）：地图窗口上叠宣言「写作之外的日子，也在这里。」，虚化期间侧栏换成番茄专注 →
 * 番茄做完（专注于「列出第二章提纲」）→ 飞到待办勾掉这条 → 飞到日程，番茄钟日历里多出这一个 → 飞到日记写一句 →
 * 拉远，四个窗口一起缩小、飞进中间今日窗口里各自的位置（番茄进顶部统计、待办进待办卡、日程进日程卡、日记进最近编辑），
 * 今日窗口在它们落下处浮现，数字跟着跳。
 * 世界坐标：番茄窗口就是知识地图段的地图窗口（原点、原尺寸），另外三个窗口围成 2×2，今日窗口在四个窗口中间。
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { cameraAt, Place, World, type Shot } from "../../../kit/Camera";
import { typed } from "../../../kit/typing";
import { clickAt, Cursor, type CursorStop } from "../../../kit/Cursor";
import { useAppTheme } from "../../../app-kit/theme";
import { AppWindow, WINDOW } from "../../../app-kit/AppWindow";
import { DiaryPage } from "../../../app-kit/pages/DiaryPage";
import { PomodoroPage } from "../../../app-kit/pages/PomodoroPage";
import { SchedulePage } from "../../../app-kit/pages/SchedulePage";
import { TodayPage } from "../../../app-kit/pages/TodayPage";
import { TodosPage } from "../../../app-kit/pages/TodosPage";
import { Toast } from "../../../app-kit/parts/Toast";
import { DAILY } from "../../../mock/deepwork";
import { DAILY_TAGS, MANIFESTOS } from "../copy";
import { at, beatFrames, P } from "../timeline";
import { MapChapter } from "./MapChapter";

/** 四个窗口围成 2×2，今日窗口在中间 */
const SPOTS = {
  pomodoro: { x: 0, y: 0 },
  todos: { x: 1680, y: 0 },
  schedule: { x: 1680, y: 1060 },
  diary: { x: 0, y: 1060 },
};
const TODAY = { x: 840, y: 530 };
const OVERVIEW = { x: TODAY.x, y: TODAY.y, zoom: 0.5 };
/** 地图段结束时的机位 */
const MAP_END = { x: 0, y: 0, zoom: 1.12 * 1.02 };

/** 今日窗口里各块的位置（窗口左上角为原点，实测自 Gallery-dailyToday）：中心与宽度 */
const LANDING = {
  pomodoro: { x: 1080, y: 86, width: 210 },
  todos: { x: 834, y: 248, width: 368 },
  schedule: { x: 1214, y: 248, width: 368 },
  diary: { x: 454, y: 588, width: 368 },
};
type Key = keyof typeof LANDING;
/** 点按位置（窗口坐标，Measure-daily* 实测） */
const TARGET = {
  todoCheck: { x: 363, y: 263 },
  diaryInput: { x: 640, y: 795 },
  diarySend: { x: 1191, y: 822 },
};
const ORDER: Key[] = ["pomodoro", "todos", "schedule", "diary"];
const landingWorld = (key: Key) => ({ x: TODAY.x - WINDOW.width / 2 + LANDING[key].x, y: TODAY.y - WINDOW.height / 2 + LANDING[key].y, scale: LANDING[key].width / WINDOW.width });

const chars = (s: string) => s.replace(/\s/g, "").length;

/** 窗口 + 顶部居中的 toast（toast 相对整个窗口定位，同真实的 fixed 视口居中） */
function WithToast({ theme, toast, children }: { theme: string; toast?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative" style={{ width: WINDOW.width, height: WINDOW.height }}>
      {children}
      {toast && (
        <div data-theme={theme} data-mode="light" className="absolute inset-0">
          {toast}
        </div>
      )}
    </div>
  );
}

export function DailyChapter() {
  const frame = useCurrentFrame();
  const appTheme = useAppTheme();
  const D = P.daily;
  const O = DAILY.pomodoro;

  // —— 镜头：地图窗口原位 → 推近番茄播放器 → 沿 2×2 逐个飞 → 拉远看全 → 推进今日窗口
  const shots: Shot[] = [
    { at: at(D.start), ...MAP_END },
    { at: at(D.manifesto[1]), ...MAP_END, ease: ease.soft },
    { at: at(D.pomodoro.done), x: -170, y: -130, zoom: 1.36, ease: ease.inOut },
    { at: at(D.pomodoro.leave), x: -150, y: -120, zoom: 1.38, ease: ease.soft },
    { at: at(D.todos.arrive), x: SPOTS.todos.x - 40, y: SPOTS.todos.y - 150, zoom: 1.3, ease: ease.inOut, dip: 0.4 },
    { at: at(D.todos.leave), x: SPOTS.todos.x - 30, y: SPOTS.todos.y - 160, zoom: 1.34, ease: ease.soft },
    { at: at(D.schedule.arrive), x: SPOTS.schedule.x + 470, y: SPOTS.schedule.y + 60, zoom: 1.5, ease: ease.inOut, dip: 0.4 },
    { at: at(D.schedule.leave), x: SPOTS.schedule.x + 480, y: SPOTS.schedule.y + 70, zoom: 1.56, ease: ease.soft },
    { at: at(D.diary.arrive), x: SPOTS.diary.x, y: SPOTS.diary.y + 20, zoom: 1.1, ease: ease.inOut, dip: 0.4 },
    { at: at(D.diary.leave), x: SPOTS.diary.x + 10, y: SPOTS.diary.y + 30, zoom: 1.14, ease: ease.soft },
    { at: at(D.pull), ...OVERVIEW, ease: ease.inOut },
    { at: at(D.today), x: TODAY.x, y: TODAY.y, zoom: 1.12, ease: ease.inOut },
    { at: at(D.end), x: TODAY.x, y: TODAY.y, zoom: 1.16, ease: ease.soft },
  ];
  const camera = cameraAt(frame, shots);

  // —— 光标：各窗口自带一个，抵达后移过去点按，起飞前淡出
  const beatLen = beatFrames(D.start);
  const todoCursor: CursorStop[] = [{ at: at(D.todos.arrive) - 0.5 * beatLen, x: 760, y: 520 }, ...clickAt(TARGET.todoCheck, at(D.todos.check), 0.75 * beatLen)];
  const diaryCursor: CursorStop[] = [
    { at: at(D.diary.arrive) - 0.5 * beatLen, x: 900, y: 520 },
    ...clickAt(TARGET.diaryInput, at(D.diary.focus), 0.4 * beatLen),
    ...clickAt(TARGET.diarySend, at(D.diary.send), 0.9 * beatLen),
  ];

  // —— 番茄：倒数最后两秒（按真实秒走）→ 完成，回到「开始专注」，账本今天那一行落下这一个
  const total = O.minutes * 60;
  const pomodoroDone = frame >= at(D.pomodoro.done);
  const elapsed = total - Math.max(0, (at(D.pomodoro.done) - frame) / 60);
  const pomodoroData = { ...O, boundTitle: true, summary: [...(pomodoroDone ? O.summary.after : O.summary.before), O.summary.streak] as [string, string, number] };

  // —— 待办：勾掉 → 让位收进「已完成」
  const T = D.todos;
  const checkT = progress(frame, at(T.check), 34, t => t);

  // —— 日记
  const R = D.diary;
  const draft = typed(DAILY.diary.typed, frame, at(R.type), 1.5);
  const sentT = progress(frame, at(R.send), 40, t => t);
  const sentMoment = { time: DAILY.diary.now, text: DAILY.diary.typed };

  // —— 汇进今日：四个窗口依次起飞（错开 0.15 拍），落到今日窗口里对应的位置
  const flight = (i: number) => progress(frame, at(D.converge[0] + i * 0.15), at(D.converge[1]) - at(D.converge[0]) - 0.45 * 60, ease.inOut);
  const landed = (key: Key) => flight(ORDER.indexOf(key)) >= 1;
  const glow = (key: Key) => {
    const start = at(D.converge[0] + ORDER.indexOf(key) * 0.15) + (at(D.converge[1]) - at(D.converge[0]) - 0.45 * 60);
    return progress(frame, start - 4, 8) * (1 - progress(frame, start + 10, 30));
  };
  const todayIn = progress(frame, at(D.converge[0] + 0.25), at(D.converge[0] + 1.5) - at(D.converge[0] + 0.25), ease.inOut);
  const Y = DAILY.today;
  const todayWords = landed("diary") ? Y.words[1] : Y.words[0];
  const recentMeta = `今天 · ${chars(DAILY.diary.days[0].moments[0].text) + chars(DAILY.diary.typed)} 字`;

  const veil = manifestoVeil(frame, at(D.manifesto[0]), at(D.manifesto[1]));
  const swapped = frame >= at(D.swap);
  const pomodoroToast = progress(frame, at(D.pomodoro.done), 12) * (1 - progress(frame, at(D.pomodoro.leave) + 20, 12));
  const todoToast = progress(frame, at(T.check) + 4, 12) * (1 - progress(frame, at(T.leave) + 20, 12));

  const windows: Record<Key, ReactNode> = {
    pomodoro: (
      <WithToast theme={appTheme} toast={<Toast message={`完成「${O.preset}」· ${O.minutes} 分钟`} appear={pomodoroToast} />}>
        <AppWindow active="pomodoro">
          <PomodoroPage elapsed={elapsed} data={pomodoroData} idle={pomodoroDone} session={{ block: O.session, appear: progress(frame, at(D.pomodoro.done) + 6, 14), total: "1h 40m" }} />
        </AppWindow>
      </WithToast>
    ),
    todos: (
      <WithToast theme={appTheme} toast={<Toast message={`已完成「${DAILY.todo}」`} action="撤销" appear={todoToast} />}>
        <AppWindow active="todos">
          <TodosPage groups={DAILY.todos.groups} summary={DAILY.todos.summary} fold={{ now: "15:56" }} checking={{ title: DAILY.todo, t: checkT }} />
        </AppWindow>
        <Cursor path={todoCursor} visibleFrom={at(D.todos.arrive) - 0.5 * beatLen} visibleTo={at(D.todos.leave) - 12} />
      </WithToast>
    ),
    schedule: (
      <AppWindow active="schedule">
        <SchedulePage
          week={DAILY.schedule.week}
          nowHour={DAILY.schedule.nowHour}
          events={DAILY.schedule.events}
          added={DAILY.schedule.added}
          appear={[progress(frame, at(D.schedule.add), 16)]}
          calendars={DAILY.schedule.calendars}
          todayCount={frame >= at(D.schedule.add) ? 4 : 3}
        />
      </AppWindow>
    ),
    diary: (
      <WithToast theme={appTheme}>
        <AppWindow active="diary">
          <DiaryPage
            summary={DAILY.diary.summary}
            days={DAILY.diary.days}
            months={DAILY.diary.months}
            now={DAILY.diary.now}
            draft={frame < at(R.send) ? draft.text : ""}
            sent={{ moment: sentMoment, t: sentT }}
          />
        </AppWindow>
        <Cursor path={diaryCursor} visibleFrom={at(D.diary.arrive) - 0.5 * beatLen} visibleTo={at(D.diary.send) + 20} />
      </WithToast>
    ),
  };

  return (
    <>
      <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        {!swapped && <MapChapter />}
        {swapped && (
          <World shots={[{ at: 0, ...camera }]}>
            <>
              {todayIn > 0 && (
                <Place x={TODAY.x} y={TODAY.y} style={{ opacity: todayIn, transform: `translate(-50%, -50%) scale(${0.96 + 0.04 * todayIn})` }}>
                  <AppWindow active="home">
                    <TodayPage
                      greeting={Y.greeting}
                      doneTodos={landed("todos") ? 1 : 0}
                      data={{ ...Y, focus: landed("pomodoro") ? Y.focus[1] : Y.focus[0], pomos: landed("pomodoro") ? Y.pomos[1] : Y.pomos[0], words: todayWords }}
                      addedEvent={{ ...Y.addedEvent, appear: progress(frame, at(D.converge[1]) - 0.45 * 60 + 0.3 * 60, 14) }}
                      addedRecent={{ ...Y.addedRecent, meta: recentMeta, appear: landed("diary") ? progress(frame, at(D.converge[1]) - 0.45 * 60 + 0.45 * 60, 14) : 0 }}
                      glow={{ hero: glow("pomodoro"), todos: glow("todos"), events: glow("schedule"), recent: glow("diary") }}
                    />
                  </AppWindow>
                </Place>
              )}
              {ORDER.map((key, i) => {
                const t = flight(i);
                if (t >= 1) return null;
                const from = SPOTS[key];
                const to = landingWorld(key);
                const scale = Math.exp(Math.log(1) + (Math.log(to.scale) - Math.log(1)) * t);
                return (
                  <Place key={key} x={mix(from.x, to.x, t)} y={mix(from.y, to.y, t)} style={{ opacity: 1 - progress(t, 0.75, 0.25, ease.in), transform: `translate(-50%, -50%) scale(${scale})` }}>
                    {windows[key]}
                  </Place>
                );
              })}
            </>
          </World>
        )}
      </AbsoluteFill>
      <ModuleTag module={DAILY_TAGS[0].module} feature={DAILY_TAGS[0].feature} at={at(D.manifesto[1])} out={at(D.pomodoro.leave) + 6} />
      <ModuleTag module={DAILY_TAGS[1].module} feature={DAILY_TAGS[1].feature} at={at(T.arrive) - 6} out={at(T.leave) + 6} />
      <ModuleTag module={DAILY_TAGS[2].module} feature={DAILY_TAGS[2].feature} at={at(D.schedule.arrive) - 6} out={at(D.schedule.leave) + 6} />
      <ModuleTag module={DAILY_TAGS[3].module} feature={DAILY_TAGS[3].feature} at={at(R.arrive) - 6} out={at(R.leave)} />
      <ModuleTag module={DAILY_TAGS[4].module} feature={DAILY_TAGS[4].feature} at={at(D.today) - 10} out={at(D.end)} />
      <ManifestoOverlay text={MANIFESTOS.daily.text} sub={MANIFESTOS.daily.sub} accent={MANIFESTOS.daily.accent} at={at(D.manifesto[0])} out={at(D.manifesto[1])} size={112} />
    </>
  );
}
