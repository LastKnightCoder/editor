import { mountBlogPage } from "@blog/services/bootstrap";
import { ToastHost } from "@tau/ui";
import DocPage from "./DocPage";
import "@blog/styles/global.css";

// 开发环境使用 mock 数据
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ getMockDocPageData }) => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    window._INIT_DATA_ = getMockDocPageData(demo);
    void mountBlogPage(
      <>
        {" "}
        <ToastHost />
        <DocPage />{" "}
      </>
    );
  });
} else {
  void mountBlogPage(
    <>
      {" "}
      <DocPage />{" "}
    </>
  );
}
