import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ArticlePage from "./ArticlePage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockArticlePageData }) => {
    window._INIT_DATA_ = mockArticlePageData;
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ArticlePage />
      </StrictMode>,
    );
  });
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ArticlePage />
    </StrictMode>,
  );
}
