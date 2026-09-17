/**
 * 样板间入口（独立 MPA：showcase.html，端口 6199，纯浏览器无 Electron）。
 * 主题复用 themeStore（与壳层同机制：localStorage 持久化 + system 跟随），
 * 滚动条复用壳层的细墨条自动显形。ToastHost 挂载一次供 Toast 档案真实触发。
 */

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { initThemeRuntime } from "@/ui/theme/themeStore";
import { initScrollbarAutoHide } from "@/app/scrollbarAutoHide";
import "./showcase.css";
import { ShowcaseApp } from "./ShowcaseApp";

initThemeRuntime();
initScrollbarAutoHide();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShowcaseApp />
  </StrictMode>
);
