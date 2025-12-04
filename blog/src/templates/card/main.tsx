import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CardPage from "./CardPage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockCardPageData }) => {
    window._INIT_DATA_ = mockCardPageData;
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <CardPage />
      </StrictMode>,
    );
  });
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <CardPage />
    </StrictMode>,
  );
}
