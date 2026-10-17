import { mountBlogPage } from "@blog/services/bootstrap";
import { ToastHost } from "@tau/ui";
import QuestPage from "./QuestPage";
import "@blog/styles/global.css";

if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockQuestMultiAnswerPageData, mockQuestPageData }) => {
    const params = new URLSearchParams(window.location.search);
    window._INIT_DATA_ =
      params.get("variant") === "multi" ? mockQuestMultiAnswerPageData : mockQuestPageData;
    void mountBlogPage(
      <>
        {" "}
        <ToastHost />
        <QuestPage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <ToastHost />
      <QuestPage />{" "}
    </>
  );
}
