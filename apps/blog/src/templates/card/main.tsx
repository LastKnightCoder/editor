import { mountBlogPage } from "@blog/services/bootstrap";
import CardPage from "./CardPage";
import "@blog/styles/global.css";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockCardPageData }) => {
    window._INIT_DATA_ = mockCardPageData;
    void mountBlogPage(
      <>
        {" "}
        <CardPage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <CardPage />{" "}
    </>
  );
}
