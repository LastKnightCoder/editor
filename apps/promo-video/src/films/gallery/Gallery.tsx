import { AbsoluteFill } from "remotion";
import { AppWindow } from "../../app-kit/AppWindow";
import { TodayPage } from "../../app-kit/pages/TodayPage";
import { PdfReaderPage } from "../../app-kit/pages/PdfReaderPage";
import { ReviewPage } from "../../app-kit/pages/ReviewPage";
import { PomodoroPage } from "../../app-kit/pages/PomodoroPage";
import { CardEditorPage } from "../../app-kit/pages/CardEditorPage";
import { AssistDock } from "../../app-kit/parts/AssistDock";
import { CardCrumb } from "../../app-kit/parts/Crumbs";
import { KnowledgeMapPage, MAP_CANVAS_RECT, MAP_REPORT_WIDTH, MapCaption } from "../../app-kit/pages/KnowledgeMapPage";
import { fitView, MapView } from "../../app-kit/parts/MapView";
import { MapInsightPopover, MapReportBody } from "../../app-kit/parts/MapInsights";
import { MentionPanel } from "../../app-kit/parts/MentionPanel";
import { DEEP_IDS, DEEP_INSIGHTS, DEEP_STATS } from "../../mock/deepmap";
import { MapCanvas } from "../../app-kit/parts/MapCanvas";
import { OLD_CARD_ID, TODAY_IDS } from "../../mock/map";
import { Sky } from "../../kit/Sky";
import { TodosPage } from "../../app-kit/pages/TodosPage";
import { SchedulePage } from "../../app-kit/pages/SchedulePage";
import { DatabasePage } from "../../app-kit/pages/DatabasePage";
import { BrowserPage } from "../../app-kit/pages/BrowserPage";
import { NotebookPage } from "../../app-kit/pages/NotebookPage";
import { InsightsArticlePage } from "../../app-kit/pages/InsightsArticlePage";
import { TaskAssistDock } from "../../app-kit/parts/TaskAssistDock";
import { PublishPage } from "../../app-kit/pages/PublishPage";
import { CardPage } from "../../app-kit/pages/CardPage";
import { schedule } from "../../app-kit/doc/script";
import { AI_ASSIST, ARTICLE, DAILY, FINDER_ROWS, LOOP_CARD, LOOP_REVIEW, MAP_CHAPTER } from "../../mock/deepwork";
import { DiaryPage } from "../../app-kit/pages/DiaryPage";
import { PluginsPage } from "../../app-kit/pages/PluginsPage";
import { WeReadPage } from "../../app-kit/pages/WeReadPage";
import { SettingsScreen, TransferSection } from "../../app-kit/pages/SettingsPage";
import { FinderWindow } from "../../app-kit/pages/FinderWindow";
import { ConfirmCard } from "../../app-kit/parts/Dialog";
import { MarkdownExportDialog } from "../../app-kit/parts/MarkdownExportDialog";
import { WindowLayer } from "../../app-kit/parts/WindowLayer";
import { BookOpen } from "lucide-react";
import { WhiteboardPage } from "../../app-kit/pages/WhiteboardPage";
import { BoardCanvas, type BoardReveal } from "../../app-kit/whiteboard/BoardCanvas";
import { BOARD_BOUNDS, MIND_NODES } from "../../mock/board";

/** 白板全部画出、视口适配全部内容（纸面 1186×834） */
const BOARD_FULL: BoardReveal = { shapes: [1, 1, 1], arrows: 1, link: 1, mind: MIND_NODES.map(() => 1), ref: 1 };
const BOARD_FIT = { x: BOARD_BOUNDS.x + BOARD_BOUNDS.width / 2, y: BOARD_BOUNDS.y + BOARD_BOUNDS.height / 2, zoom: 0.92 };
const boardCanvas = (sketch: boolean, palette = "classic") => <BoardCanvas view={BOARD_FIT} width={1186} height={834} reveal={BOARD_FULL} look={{ sketch, palette }} />;

/** 素材陈列：逐页检查重建界面（静帧，不进成片） */
export const GALLERY_PAGES = {
  today: () => (
    <AppWindow active="home">
      <TodayPage />
    </AppWindow>
  ),
  todayDark: () => (
    <AppWindow active="home" mode="dark">
      <TodayPage greeting="晚上好" doneTodos={2} />
    </AppWindow>
  ),
  pdf: () => (
    <AppWindow active="pdfs" crumb="PDF / 延展心智">
      <PdfReaderPage highlight={1} toolbar={1} annotation={1} convertHover={1} />
    </AppWindow>
  ),
  review: () => (
    <AppWindow active="review">
      <ReviewPage flipped={1} pressed={3} />
    </AppWindow>
  ),
  pomodoro: () => (
    <AppWindow active="pomodoro">
      <PomodoroPage elapsed={460} />
    </AppWindow>
  ),
  cardTyping: () => (
    <AppWindow active="cards" crumb={<CardCrumb title="笔记是思考的现场" />}>
      <CardEditorPage t={380} linkPicker={1} />
    </AppWindow>
  ),
  cardAi: () => (
    <AppWindow active="cards" crumb={<CardCrumb title="笔记是思考的现场" />} assistOpen assist={<AssistDock open={1} reveal={{ user: 1, tools: [1, 1, 1], answer: 1 }} />}>
      <CardEditorPage t={900} />
    </AppWindow>
  ),
  map: () => (
    <AppWindow active="knowledge-map" mode="dark" mapActive crumb="知识地图">
      <KnowledgeMapPage
        report={1}
        canvas={{
          insight: 1,
          todayGlow: 1,
          titles: [
            { id: TODAY_IDS.card, opacity: 1 },
            { id: OLD_CARD_ID, opacity: 1, above: true },
          ],
        }}
      />
    </AppWindow>
  ),
  deepMap: () => (
    <AppWindow active="knowledge-map" mapActive crumb="知识地图">
      <KnowledgeMapPage
        stats={DEEP_STATS}
        caption={<MapCaption text={`${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}`} state="idle" />}
        canvasSlot={<MapView width={MAP_CANVAS_RECT.width} height={MAP_CANVAS_RECT.height} view={fitView(MAP_CANVAS_RECT.width, MAP_CANVAS_RECT.height)} current={[DEEP_IDS["先改环境，再谈专注"]]} />}
      />
    </AppWindow>
  ),
  deepMapSub: () => (
    <AppWindow active="knowledge-map" mapActive crumb="知识地图">
      <KnowledgeMapPage
        stats={DEEP_STATS}
        caption={<MapCaption text="2023年5月 · 312 条" state="playing" />}
        canvasSlot={<MapView width={MAP_CANVAS_RECT.width} height={MAP_CANVAS_RECT.height} view={{ x: 600, y: 330, scale: 1.8 }} />}
      />
    </AppWindow>
  ),
  deepMapTitles: () => (
    <AppWindow active="knowledge-map" mapActive crumb="知识地图">
      <KnowledgeMapPage
        stats={DEEP_STATS}
        canvasSlot={
          <MapView
            width={MAP_CANVAS_RECT.width}
            height={MAP_CANVAS_RECT.height}
            view={{ x: 640, y: 335, scale: 3.4 }}
            current={[DEEP_IDS["先改环境，再谈专注"]]}
            focus={{ id: DEEP_IDS["先改环境，再谈专注"], amount: 1 }}
            growing={[{ a: DEEP_IDS["先改环境，再谈专注"], b: DEEP_IDS["注意力残留"], t: 1 }]}
          />
        }
      />
    </AppWindow>
  ),
  deepMapInsight: () => {
    const width = MAP_CANVAS_RECT.width - MAP_REPORT_WIDTH;
    return (
      <AppWindow active="knowledge-map" mapActive crumb="知识地图">
        <KnowledgeMapPage
          stats={DEEP_STATS}
          report={1}
          insightButton="on"
          reportBody={<MapReportBody content={MAP_CHAPTER.report} reading={false} appear={1} />}
          caption={<MapCaption text={`${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}`} state="idle" />}
          canvasSlot={
            <MapView
              width={width}
              height={MAP_CANVAS_RECT.height}
              view={fitView(width, MAP_CANVAS_RECT.height)}
              insight={{ arcs: DEEP_INSIGHTS.arcs.map(a => ({ ...a, draw: 1 })), selected: { index: 1, amount: 1 }, pin: { ...DEEP_INSIGHTS.pin, appear: 1 } }}
              chips={[DEEP_INSIGHTS.arcs[1].a, DEEP_INSIGHTS.arcs[1].b].map(id => ({ id, opacity: 1 }))}
            >
              <div className="absolute" style={{ left: 300, top: 420 }}>
                <MapInsightPopover {...MAP_CHAPTER.popover} />
              </div>
            </MapView>
          }
        />
      </AppWindow>
    );
  },
  mention: () => (
    <AppWindow active="cards" crumb={<CardCrumb title="先改环境，再谈专注" />}>
      <CardPage
        timed={schedule(LOOP_CARD.blocks, -100000)}
        frame={0}
        words={92}
        links={LOOP_CARD.links}
        tags={LOOP_CARD.tags}
        created={LOOP_CARD.created}
        tail={
          <p className="relative mb-[1.25em]">
            {MAP_CHAPTER.sentence.before}
            <span className="text-ink-1">[[{MAP_CHAPTER.query}</span>
            <span className="relative inline-block h-[1em] w-0">
              <span className="absolute top-[1.6em] left-0 z-10">
                <MentionPanel query={MAP_CHAPTER.query} items={[...MAP_CHAPTER.mentions]} />
              </span>
            </span>
          </p>
        }
      />
    </AppWindow>
  ),
  dailyPomodoro: () => (
    <AppWindow active="pomodoro">
      <PomodoroPage elapsed={DAILY.pomodoro.minutes * 60 - 3} data={{ ...DAILY.pomodoro, summary: [...DAILY.pomodoro.summary.before, 42] as [string, string, number], boundTitle: true }} />
    </AppWindow>
  ),
  dailyTodos: () => (
    <AppWindow active="todos">
      <TodosPage groups={DAILY.todos.groups} summary={DAILY.todos.summary} fold={{ now: "15:56" }} checking={{ title: DAILY.todo, t: 0.4 }} />
    </AppWindow>
  ),
  dailySchedule: () => (
    <AppWindow active="schedule">
      <SchedulePage
        week={DAILY.schedule.week}
        nowHour={DAILY.schedule.nowHour}
        events={DAILY.schedule.events}
        added={DAILY.schedule.added}
        appear={[1]}
        calendars={DAILY.schedule.calendars}
        todayCount={5}
      />
    </AppWindow>
  ),
  dailyDiary: () => (
    <AppWindow active="diary">
      <DiaryPage summary={DAILY.diary.summary} days={DAILY.diary.days} months={DAILY.diary.months} now={DAILY.diary.now} draft={DAILY.diary.typed.slice(0, 20)} />
    </AppWindow>
  ),
  dailyToday: () => {
    const T = DAILY.today;
    return (
      <AppWindow active="home">
        <TodayPage
          greeting={T.greeting}
          doneTodos={1}
          data={{ ...T, dateText: T.dateText, focus: T.focus[1], pomos: T.pomos[1], words: T.words[1] }}
          addedEvent={{ ...T.addedEvent, appear: 1 }}
          addedRecent={{ ...T.addedRecent, appear: 1 }}
        />
      </AppWindow>
    );
  },
  plugins: () => (
    <AppWindow active="plugins">
      <PluginsPage install="staged" restartBar={1} />
    </AppWindow>
  ),
  pluginConfirm: () => (
    <div className="relative">
      <AppWindow active="plugins">
        <PluginsPage install="available" />
      </AppWindow>
      <WindowLayer>
        <ConfirmCard
          title="安装「微信读书」1.0.4？"
          description="插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。下载后将在下次重启时安装并自动启用。"
          confirmText="安装"
          appear={1}
        />
      </WindowLayer>
    </div>
  ),
  wereadConnect: () => (
    <AppWindow active="plugin:weread" pluginNav={{ item: { key: "plugin:weread", label: "微信读书", icon: BookOpen }, appear: 1 }}>
      <WeReadPage state={{ kind: "connect", key: "wr_sk_7f3a9c2e81d4b6" }} />
    </AppWindow>
  ),
  wereadShelf: () => (
    <AppWindow active="plugin:weread" pluginNav={{ item: { key: "plugin:weread", label: "微信读书", icon: BookOpen }, appear: 1 }}>
      <WeReadPage state={{ kind: "shelf", appear: 1 }} />
    </AppWindow>
  ),
  settingsTransfer: () => (
    <div className="relative">
      <AppWindow active="home">
        <TodayPage />
      </AppWindow>
      <WindowLayer>
        <SettingsScreen active="导入与导出">
          <TransferSection />
        </SettingsScreen>
      </WindowLayer>
    </div>
  ),
  exportDialog: () => (
    <div className="relative">
      <AppWindow active="plugin:weread" pluginNav={{ item: { key: "plugin:weread", label: "微信读书", icon: BookOpen }, appear: 1 }}>
        <WeReadPage state={{ kind: "shelf", appear: 1 }} />
      </AppWindow>
      <WindowLayer>
        <MarkdownExportDialog appear={1} scope="全部" link="wiki" progress={64} />
      </WindowLayer>
    </div>
  ),
  finder: () => <FinderWindow rows={FINDER_ROWS} selected={1} />,
  stars: () => (
    <div style={{ position: "relative", width: 1536, height: 864 }}>
      <Sky night={1} />
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <MapCanvas
          variant="star"
          width={1500}
          height={844}
          insight={1}
          todayGlow={1}
          titles={[
            { id: TODAY_IDS.card, opacity: 1 },
            { id: OLD_CARD_ID, opacity: 1, above: true },
          ]}
        />
      </div>
    </div>
  ),
  todos: () => (
    <AppWindow active="todos">
      <TodosPage doneCount={2} />
    </AppWindow>
  ),
  schedule: () => (
    <AppWindow active="schedule" mode="dark">
      <SchedulePage nowHour={17.5} />
    </AppWindow>
  ),
  pdfRaw: () => (
    <AppWindow active="pdfs" crumb="PDF / 延展心智">
      <PdfReaderPage highlight={1} />
    </AppWindow>
  ),
  board: () => (
    <AppWindow active="whiteboard" crumb="专注力手册">
      <WhiteboardPage canvas={boardCanvas(false)} tool="select" sketch={false} />
    </AppWindow>
  ),
  boardSketch: () => (
    <AppWindow active="whiteboard" crumb="专注力手册">
      <WhiteboardPage canvas={boardCanvas(true, "autumn")} tool="select" sketch />
    </AppWindow>
  ),
  browser: () => <BrowserPage state={{ select: 1, toolbar: 1, marked: true, listed: 1 }} />,
  browserSelect: () => <BrowserPage state={{ select: 0.6, toolbar: 0, marked: false, listed: 0 }} />,
  assist: () => (
    <AppWindow active="schedule" assistOpen assist={<TaskAssistDock state={{ open: 1, user: 1, tools: [1, 1], answer: 1 }} />}>
      <SchedulePage week={AI_ASSIST.week} events={AI_ASSIST.events} added={AI_ASSIST.added} appear={[1, 1, 1]} />
    </AppWindow>
  ),
  insights: () => (
    <AppWindow active="articles" crumb={<CardCrumb section="文章" title={ARTICLE.title} />}>
      <InsightsArticlePage title={ARTICLE.title} words={3280} links={5} frame={0} state={{ mode: "on", report: 1, marks: [1, 1], popover: 1, pressed: false, connected: 0 }} />
    </AppWindow>
  ),
  notebook: () => (
    <AppWindow active="vibe-learning" crumb="专注与深度工作">
      <NotebookPage state={{ added: 1, ask: 1, answer: 1 }} />
    </AppWindow>
  ),
  loopCard: () => (
    <AppWindow active="cards" crumb={<CardCrumb title="先改环境，再谈专注" />}>
      <CardPage timed={schedule(LOOP_CARD.blocks, -100000)} frame={0} words={86} links={LOOP_CARD.links} tags={LOOP_CARD.tags} created={LOOP_CARD.created} />
    </AppWindow>
  ),
  loopReview: () => (
    <AppWindow active="review">
      <ReviewPage flipped={1} pressed={3} card={LOOP_REVIEW} />
    </AppWindow>
  ),
  publish: () => (
    <AppWindow active="publish">
      <PublishPage state={{ checked: true, pressed: false, progress: 0.55, done: false }} />
    </AppWindow>
  ),
  publishDone: () => (
    <AppWindow active="publish">
      <PublishPage state={{ checked: true, pressed: false, progress: 1, done: true }} />
    </AppWindow>
  ),
  dbTable: () => (
    <AppWindow active="databases" crumb="书单">
      <DatabasePage view="table" />
    </AppWindow>
  ),
  dbKanban: () => (
    <AppWindow active="databases" crumb="书单">
      <DatabasePage view="kanban" />
    </AppWindow>
  ),
  dbGallery: () => (
    <AppWindow active="databases" crumb="书单">
      <DatabasePage view="gallery" />
    </AppWindow>
  ),
  dbCalendar: () => (
    <AppWindow active="databases" crumb="书单">
      <DatabasePage view="calendar" />
    </AppWindow>
  ),
} as const;

export type GalleryPage = keyof typeof GALLERY_PAGES;

export function Gallery({ page }: { page: GalleryPage }) {
  const Page = GALLERY_PAGES[page];
  return (
    <AbsoluteFill style={{ background: "#d9d4ca", display: "grid", placeItems: "center" }}>
      <div style={{ transform: `scale(${page === "pdfRaw" ? 1 : 1.25})` }}>
        <Page />
      </div>
    </AbsoluteFill>
  );
}
