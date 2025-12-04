import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DocPage from "./DocPage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockDocPageData }) => {
    window._INIT_DATA_ = mockDocPageData;
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <DocPage />
      </StrictMode>,
    );
  });
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <DocPage />
    </StrictMode>,
  );
}
