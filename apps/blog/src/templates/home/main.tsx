import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HomePage from "./HomePage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockHomePageData }) => {
    window._INIT_DATA_ = mockHomePageData;
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <HomePage />
      </StrictMode>,
    );
  });
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <HomePage />
    </StrictMode>,
  );
}
