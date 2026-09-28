/**
 * 样板间入口（独立 MPA：showcase.html，端口 6199，纯浏览器无 Electron）。
 * 主题复用 themeStore（与壳层同机制：localStorage 持久化 + system 跟随），
 * 滚动条复用壳层的细墨条自动显形。ToastHost 挂载一次供 Toast 档案真实触发。
 */

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { initThemeRuntime } from "@tau/themes/react";
import { initScrollbarAutoHide } from "@tau/ui";
import { initToolCallRenderers } from "@/tool-call-renderers";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import "./showcase.css";
import { ShowcaseApp } from "./ShowcaseApp";

// 对话工具渲染档案与真实聊天同一注册表（自定义渲染器 → ToolCallRow 兜底）
initToolCallRenderers();

// 富文本预览（知识检索、内容编辑 diff 视图）里的编辑器与真实壳层用同一个 getDesktopKit()，
// 扩展与服务因此与壳层一致，档案里看到的就是真实渲染结果
function ShowcaseRoot() {
  return (
    <DndProvider backend={HTML5Backend}>
      <ShowcaseApp />
    </DndProvider>
  );
}

const stopTheme = initThemeRuntime();
const stopScrollbars = initScrollbarAutoHide();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopTheme();
    stopScrollbars();
  });

// 与壳层同序：宿主扩展先装载再渲染，否则富文本档案里的内容链接 / 附件 / 白板 / 数据库块渲染不出来
void useDynamicExtensionsStore
  .getState()
  .initExtensions()
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ShowcaseRoot />
      </StrictMode>
    );
  });
