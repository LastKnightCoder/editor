import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastHost } from "@tau/ui";
import DocPage from "./DocPage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ getMockDocPageData }) => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    window._INIT_DATA_ = getMockDocPageData(demo);
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ToastHost />
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
