import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ListPage from "./ListPage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ getMockListPageData }) => {
    const params = new URLSearchParams(window.location.search);
    const listType = params.get("__dev_list_type");
    window._INIT_DATA_ = getMockListPageData(
      listType === "article" || listType === "doc" || listType === "quest"
        ? listType
        : "card",
    );
    initTheme();
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ListPage />
      </StrictMode>,
    );
  });
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ListPage />
    </StrictMode>,
  );
}
