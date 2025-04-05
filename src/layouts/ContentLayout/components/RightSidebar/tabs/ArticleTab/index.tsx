import { FileOutlined } from "@ant-design/icons";
import { registerTab } from "../../TabRegistry";
import ArticlesViewer from "./ArticlesViewer";

// 注册文章标签页
registerTab({
  type: "article",
  icon: <FileOutlined />,
  title: "文章",
  viewer: ArticlesViewer,
});
