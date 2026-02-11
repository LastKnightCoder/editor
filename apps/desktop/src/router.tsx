import { createHashRouter } from "react-router-dom";
import loadable from "@loadable/component";
import ContentLayout from "@/layouts/ContentLayout";

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

const TodoWindowPage = loadable(() => import("@/pages/TodoWindow"));
const QuestionWindowPage = loadable(() => import("@/pages/QuestionWindow"));
const PomodoroWindowPage = loadable(() => import("@/pages/PomodoroWindow"));
const PomodoroMiniPage = loadable(() => import("@/pages/PomodoroWindow/Mini"));
const PomodoroImmersivePage = loadable(
  () => import("@/pages/PomodoroWindow/Immersive"),
);
const BackgroundAudioPage = loadable(() => import("@/pages/BackgroundAudio"));
const SlideManagerPage = loadable(() => import("@/pages/SlideManager"));
const SlidePresenterPage = loadable(() => import("@/pages/SlidePresenter"));
const SlideAudiencePage = loadable(() => import("@/pages/SlideAudience"));

const routes = [
  {
    path: "/",
    element: <ContentLayout />,
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
  {
    path: "/questions",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <QuestionWindowPage />,
      },
    ],
  },
  {
    path: "/pomodoro",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <PomodoroWindowPage />,
      },
    ],
  },
  {
    path: "/pomodoro/mini",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <PomodoroMiniPage />,
      },
    ],
  },
  {
    path: "/pomodoro/immersive",
    element: <PomodoroImmersivePage />,
  },
  {
    path: "/background-audio",
    element: <BackgroundAudioPage />,
  },
  {
    path: "/slides",
    element: <QuickOpenLayout title="幻灯片" />,
    children: [
      {
        index: true,
        element: <SlideManagerPage />,
      },
    ],
  },
  {
    path: "/slide-presenter",
    element: <SlidePresenterPage />,
  },
  {
    path: "/slide-audience",
    element: <SlideAudiencePage />,
  },
];

export const router = createHashRouter(routes);
export default routes;
