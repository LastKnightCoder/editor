import { createHashRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";
import { RouteErrorPage } from "@/components/ErrorState/RouteErrorPage";

const QuickCardWindow = loadable(() => import("@/features/cards/windows/QuickCardWindow"));
const FeedbackWindow = loadable(() => import("@/features/feedback/windows/FeedbackWindow"));
const EditorWindowPage = loadable(() => import("@/features/editor-window/EditorWindowPage"));
const MarkdownWindowPage = loadable(() => import("@/features/markdown-window/MarkdownWindowPage"));

const PomodoroMiniPage = loadable(() => import("@/features/pomodoro/windows/MiniWindow"));
const PomodoroImmersivePage = loadable(() => import("@/features/pomodoro/windows/ImmersiveWindow"));
const BackgroundAudioPage = loadable(() => import("@/features/pomodoro/windows/BackgroundAudio"));

const NotificationHostWindow = loadable(
  () => import("@/features/notifications/windows/NotificationHostWindow")
);

// 主窗口壳层
const AppShell = loadable(() => import("@/app/AppShell"));

const routes = [
  {
    // 根路径转到主窗口壳层
    path: "/",
    element: <Navigate to="/shell" replace />,
  },
  {
    // 快捷卡片窗口（全局快捷键唤起；自带标题栏与主题，下同）
    path: "/quick-card",
    element: <QuickCardWindow />,
  },
  {
    // 反馈窗口（单例置顶小窗，可边操作其它窗口边截图）
    path: "/feedback",
    element: <FeedbackWindow />,
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
    // 系统通知窗口：透明置顶常驻窗（主进程 notification-window 创建），承载失焦通知
    path: "/notification-host",
    element: <NotificationHostWindow />,
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
