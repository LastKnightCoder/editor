import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import QuestPage from "./QuestPage";
import "@blog/styles/global.css";
import { initTheme } from "@blog/utils";

if (import.meta.env.DEV) {
  import("@blog/mock/data").then(
    ({ mockQuestMultiAnswerPageData, mockQuestPageData }) => {
      const params = new URLSearchParams(window.location.search);
      window._INIT_DATA_ =
        params.get("variant") === "multi"
          ? mockQuestMultiAnswerPageData
          : mockQuestPageData;
      initTheme();
      createRoot(document.getElementById("root")!).render(
        <StrictMode>
          <QuestPage />
        </StrictMode>,
      );
    },
  );
} else {
  initTheme();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QuestPage />
    </StrictMode>,
  );
}
