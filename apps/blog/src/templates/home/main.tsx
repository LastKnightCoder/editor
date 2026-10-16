import { mountBlogPage } from "@blog/services/bootstrap";
import HomePage from "./HomePage";
import "@blog/styles/global.css";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockHomePageData }) => {
    window._INIT_DATA_ = mockHomePageData;
    void mountBlogPage(
      <>
        {" "}
        <HomePage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <HomePage />{" "}
    </>
  );
}
