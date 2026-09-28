/**
 * 样板间入口（独立 MPA：showcase.html，端口 6199，纯浏览器无 Electron）。
 * 主题复用 themeStore（与壳层同机制：localStorage 持久化 + system 跟随），
 * 滚动条复用壳层的细墨条自动显形。ToastHost 挂载一次供 Toast 档案真实触发。
 */

import { StrictMode, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { EditorProvider } from "@tau/editor/src";
import { initThemeRuntime } from "@tau/themes/react";
import { initScrollbarAutoHide } from "@tau/ui";
import { initToolCallRenderers } from "@/tool-call-renderers";
import { createEditorRegistry } from "@/services/editorRegistry";
import { useDesktopEditorConfig } from "@/services/useDesktopEditorConfig";
import { createDesktopEditorExtensions } from "@/editor-extensions";
import "./showcase.css";
import { ShowcaseApp } from "./ShowcaseApp";

// 对话工具渲染档案与真实聊天同一注册表（自定义渲染器 → ToolCallRow 兜底）
initToolCallRenderers();

// 编辑器上下文与真实壳层同一套注入（registry / config / extensions 均为真实实现）：
// 工具渲染档案里的富文本预览（知识检索、内容编辑 diff 视图）依赖 EditorProvider
function ShowcaseRoot() {
  const editorRegistry = useMemo(() => createEditorRegistry(), []);
  const editorExtensions = useMemo(() => createDesktopEditorExtensions(), []);
  const editorConfig = useDesktopEditorConfig();

  return (
    <EditorProvider registry={editorRegistry} config={editorConfig} extensions={editorExtensions}>
      <DndProvider backend={HTML5Backend}>
        <ShowcaseApp />
      </DndProvider>
    </EditorProvider>
  );
}

const stopTheme = initThemeRuntime();
const stopScrollbars = initScrollbarAutoHide();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopTheme();
    stopScrollbars();
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShowcaseRoot />
  </StrictMode>
);
