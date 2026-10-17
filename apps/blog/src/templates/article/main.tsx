import { mountBlogPage } from "@blog/services/bootstrap";
import ArticlePage from "./ArticlePage";
import "@blog/styles/global.css";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockArticlePageData }) => {
    window._INIT_DATA_ = mockArticlePageData;
    void mountBlogPage(
      <>
        {" "}
        <ArticlePage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <ArticlePage />{" "}
    </>
  );
}
