import { GlobalOutlined } from "@ant-design/icons";
import { registerTab } from "../../TabRegistry";
import WebviewsViewer from "./WebviewsViewer";

// 注册网页浏览标签页
registerTab({
  type: "webview",
  icon: <GlobalOutlined />,
  title: "网页",
  viewer: WebviewsViewer,
});
