import { createHashRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";
import { RouteErrorPage } from "@/components/ErrorState/RouteErrorPage";

const QuickCardWindow = loadable(() => import("@/features/cards/windows/QuickCardWindow"));
const EditorWindowPage = loadable(() => import("@/features/editor-window/EditorWindowPage"));
const MarkdownWindowPage = loadable(() => import("@/features/markdown-window/MarkdownWindowPage"));

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
    // 快捷卡片窗口（全局快捷键唤起；自带标题栏与主题，下同）
    path: "/quick-card",
    element: <QuickCardWindow />,
  },
  {
    // 卡片 / 文章 / 项目文档的独立编辑窗口
    path: "/editor-window",
    element: <EditorWindowPage />,
  },
  {
    // 磁盘 Markdown 文件 / 文件夹窗口
    path: "/markdown-window",
    element: <MarkdownWindowPage />,
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
