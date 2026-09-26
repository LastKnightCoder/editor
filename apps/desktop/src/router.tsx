import { createHashRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";
import ContentLayout from "@/layouts/ContentLayout";
import { RouteErrorPage } from "@/components/ErrorState/RouteErrorPage";

const QuickCard = loadable(() => import("@/pages/QuickCard"));
const EditorWindowPage = loadable(() => import("@/features/editor-window/EditorWindowPage"));
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
    // 卡片 / 文章 / 项目文档的独立编辑窗口（自带标题栏与主题，不走 QuickOpenLayout）
    path: "/editor-window",
    element: <EditorWindowPage />,
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

// 每个顶层路由都挂兜底错误页：未被页面 / 局部边界接住的渲染错误不再露出 react-router 默认堆栈页
export const router = createHashRouter(
  routes.map(route => ({ ...route, errorElement: <RouteErrorPage /> }))
);
export default routes;
