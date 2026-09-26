import { memo, lazy, Suspense } from "react";
import { TabType, ITab } from "@/types/tab";
import { TabProvider } from "@/contexts/TabContext";
import { LoadingOutlined } from "@ant-design/icons";

const CardListView = lazy(() => import("@/pages/card-list-view/CardListView"));
const CardDetailView = lazy(() => import("@/pages/CardDetailView"));
const ArticleListView = lazy(() => import("@/pages/ArticleListView"));
const ArticleDetailView = lazy(() => import("@/pages/ArticleDetailView"));
const WhiteBoardView = lazy(() => import("@/pages/WhiteBoardView"));
const WhiteboardDetailView = lazy(() => import("@/pages/WhiteboardDetailView"));
const PdfListView = lazy(() => import("@/pages/PdfView/PdfListView"));
const PdfDetailView = lazy(() => import("@/pages/PdfView/PdfDetailView"));
const DailyNoteView = lazy(() => import("@/pages/DiaryView"));
const VecDocumentView = lazy(() => import("@/pages/VecDocumentView"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const CalendarPage = lazy(() => import("@/features/schedule/views/ScheduleView"));
const ChatManagementPage = lazy(() => import("@/pages/ChatManagement"));
const TodoWindowPage = lazy(() => import("@/pages/TodoWindow"));
const QuestionWindowPage = lazy(() => import("@/pages/QuestionWindow"));
const PomodoroWindowPage = lazy(() => import("@/pages/PomodoroWindow"));
const HomeView = lazy(() => import("@/pages/HomeView"));
const WeReadPage = lazy(() => import("@/pages/WeRead"));
const WebViewPage = lazy(() => import("@/pages/WebViewPage"));
const FlashcardCenterPage = lazy(() => import("@/pages/FlashcardCenter"));
const BlockPreviewPage = lazy(() => import("@/pages/BlockPreviewPage"));

interface TabContentProps {
  tab: ITab;
  paneId: string;
}

const LoadingFallback = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      width: "100%",
    }}
  >
    <LoadingOutlined style={{ fontSize: 24 }} spin />
  </div>
);

const TabContent = memo((props: TabContentProps) => {
  const { tab, paneId } = props;

  const renderContent = () => {
    switch (tab.type) {
      case TabType.Home:
        return <HomeView />;

      case TabType.CardList:
        return <CardListView />;

      case TabType.CardDetail:
        return <CardDetailView />;

      case TabType.ArticleList:
        return <ArticleListView />;

      case TabType.ArticleDetail:
        return <ArticleDetailView />;

      case TabType.WhiteBoardList:
        return <WhiteBoardView />;

      case TabType.WhiteBoardDetail:
        return <WhiteboardDetailView />;

      case TabType.PdfList:
        return <PdfListView />;

      case TabType.PdfDetail:
        return <PdfDetailView />;

      case TabType.DailyNote:
        return <DailyNoteView />;

      case TabType.VecDocument:
        return <VecDocumentView />;

      case TabType.Settings:
        return <SettingsPage />;

      case TabType.Calendar:
        return <CalendarPage />;

      case TabType.ChatManagement:
        return <ChatManagementPage />;

      case TabType.Todo:
        return <TodoWindowPage />;

      case TabType.Questions:
        return <QuestionWindowPage />;

      case TabType.Pomodoro:
        return <PomodoroWindowPage />;

      case TabType.WeRead:
        return <WeReadPage />;

      case TabType.WebView:
        return <WebViewPage />;

      case TabType.FlashcardCenter:
        return <FlashcardCenterPage />;

      case TabType.BlockPreview:
        return <BlockPreviewPage />;

      default:
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            未知的页面类型: {tab.type}
          </div>
        );
    }
  };

  return (
    <TabProvider tab={tab} paneId={paneId}>
      <Suspense fallback={<LoadingFallback />}>
        <div style={{ width: "100%", height: "100%" }}>{renderContent()}</div>
      </Suspense>
    </TabProvider>
  );
});

export default TabContent;
