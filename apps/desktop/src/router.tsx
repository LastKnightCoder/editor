import { createHashRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";
import ContentLayout from "@/layouts/ContentLayout";

const QuickCard = loadable(() => import("@/pages/QuickCard"));
const SingleCardEditor = loadable(() => import("@/pages/SingleCardEditor"));
const SingleArticleEditor = loadable(() => import("@/pages/SingleArticleEditor"));
const SingleProjectItemEditor = loadable(() => import("@/pages/SingleProjectItemEditor"));
const SingleMarkdownEditor = loadable(() => import("@/pages/SingleMarkdownEditor"));

const QuickOpenLayout = loadable(() => import("@/layouts/QuickOpenLayout"));

const TodoWindowPage = loadable(() => import("@/pages/TodoWindow"));
const PomodoroWindowPage = loadable(() => import("@/pages/PomodoroWindow"));
const PomodoroMiniPage = loadable(() => import("@/features/pomodoro/windows/MiniWindow"));
const PomodoroImmersivePage = loadable(() => import("@/features/pomodoro/windows/ImmersiveWindow"));
const BackgroundAudioPage = loadable(() => import("@/pages/BackgroundAudio"));

// 新架构壳层预览入口（docs/redesign/03-架构实现指南.md）
const AppShell = loadable(() => import("@/app/AppShell"));

const routes = [
  {
    // 主窗口默认进入新架构壳层（docs/redesign/03-架构实现指南.md）；旧主界面挪至 /legacy
    path: "/",
    element: <Navigate to="/shell" replace />,
  },
  {
    path: "/legacy",
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
    element: <PomodoroMiniPage />,
  },
  {
    path: "/pomodoro/immersive",
    element: <PomodoroImmersivePage />,
  },
  {
    path: "/shell",
    element: <AppShell />,
  },
  {
    path: "/background-audio",
    element: <BackgroundAudioPage />,
  },
];

export const router = createHashRouter(routes);
export default routes;
