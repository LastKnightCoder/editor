import { createHashRouter } from "react-router-dom";
import loadable from "@loadable/component";
import HomeView from "@/pages/HomeView";
import ContentLayout from "@/layouts/ContentLayout";
import CardListView from "@/pages/card-list-view/CardListView";

const SettingsPage = loadable(() => import("@/pages/Settings"));

const QuickCard = loadable(() => import("@/pages/QuickCard"));
const SingleCardEditor = loadable(() => import("@/pages/SingleCardEditor"));
const SingleArticleEditor = loadable(
  () => import("@/pages/SingleArticleEditor"),
);
const SingleProjectItemEditor = loadable(
  () => import("@/pages/SingleProjectItemEditor"),
);
const SingleDocumentItemEditor = loadable(
  () => import("@/pages/SingleDocumentItemEditor"),
);
const SingleMarkdownEditor = loadable(
  () => import("@/pages/SingleMarkdownEditor"),
);

const QuickOpenLayout = loadable(() => import("@/layouts/QuickOpenLayout"));

// const CardListView = loadable(
//   () => import("@/pages/card-list-view/CardListView"),
// );
const CardDetailView = loadable(() => import("@/pages/CardDetailView"));
const ArticleListView = loadable(() => import("@/pages/ArticleListView"));
const ArticleDetailView = loadable(() => import("@/pages/ArticleDetailView"));
const WhiteBoardView = loadable(() => import("@/pages/WhiteBoardView"));
const WhiteboardDetailView = loadable(
  () => import("@/pages/WhiteboardDetailView"),
);
const DocumentsView = loadable(() => import("@/pages/DocumentsView"));
const DocumentView = loadable(() => import("@/pages/DocumentView"));
const ProjectsView = loadable(() => import("@/pages/ProjectsView"));
const ProjectView = loadable(() => import("@/pages/ProjectView"));
const PdfListView = loadable(() => import("@/pages/PdfView/PdfListView"));
const PdfDetailView = loadable(() => import("@/pages/PdfView/PdfDetailView"));
const DailyNoteView = loadable(() => import("@/pages/DailyNoteView"));
const TimeRecordView = loadable(() => import("@/pages/TimeRecordView"));
const VecDocumentView = loadable(() => import("@/pages/VecDocumentView"));
const GoalManagementView = loadable(
  () => import("@/pages/GoalView/GoalManagementView"),
);
const TodoWindowPage = loadable(() => import("@/pages/TodoWindow"));

const routes = [
  {
    path: "/",
    element: <ContentLayout />,
    children: [
      {
        path: "/",
        element: <HomeView />,
      },
      {
        path: "cards/list",
        element: <CardListView />,
      },
      {
        path: "cards/detail/:id",
        element: <CardDetailView />,
      },
      {
        path: "articles/list",
        element: <ArticleListView />,
      },
      {
        path: "articles/detail/:id",
        element: <ArticleDetailView />,
      },
      {
        path: "projects/list",
        element: <ProjectsView />,
      },
      {
        path: "projects/detail/:id",
        element: <ProjectView />,
      },
      {
        path: "documents/list",
        element: <DocumentsView />,
      },
      {
        path: "documents/detail/:id",
        element: <DocumentView />,
      },
      {
        path: "white-board/list",
        element: <WhiteBoardView />,
      },
      {
        path: "white-board/detail/:id",
        element: <WhiteboardDetailView />,
      },
      {
        path: "pdfs/list",
        element: <PdfListView />,
      },
      {
        path: "pdfs/detail/:id",
        element: <PdfDetailView />,
      },
      {
        path: "dailies",
        element: <DailyNoteView />,
      },
      {
        path: "time-records",
        element: <TimeRecordView />,
      },
      {
        path: "vec-documents",
        element: <VecDocumentView />,
      },
      {
        path: "goals",
        element: <GoalManagementView />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
  {
    path: "/quick-card",
    element: <QuickOpenLayout title="快捷卡片" />,
    children: [
      {
        index: true,
        element: <QuickCard />,
      },
    ],
  },
  {
    path: "/single-card-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleCardEditor />,
      },
    ],
  },
  {
    path: "/single-article-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleArticleEditor />,
      },
    ],
  },
  {
    path: "/single-project-item-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleProjectItemEditor />,
      },
    ],
  },
  {
    path: "/single-document-item-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleDocumentItemEditor />,
      },
    ],
  },
  {
    path: "/single-markdown-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleMarkdownEditor />,
      },
    ],
  },
  {
    path: "/todo",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <TodoWindowPage />,
      },
    ],
  },
];

export const router = createHashRouter(routes);
export default routes;
