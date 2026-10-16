import { mountBlogPage } from "@blog/services/bootstrap";
import ListPage from "./ListPage";
import "@blog/styles/global.css";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ getMockListPageData }) => {
    const params = new URLSearchParams(window.location.search);
    const listType = params.get("__dev_list_type");
    window._INIT_DATA_ = getMockListPageData(
      listType === "article" || listType === "doc" || listType === "quest" ? listType : "card"
    );
    void mountBlogPage(
      <>
        {" "}
        <ListPage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <ListPage />{" "}
    </>
  );
}
