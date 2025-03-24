import { FileTextOutlined } from "@ant-design/icons";
import { registerTab } from "../../TabRegistry";
import DocumentItemsViewer from "./DocumentItemsViewer";

// 注册文档标签页
registerTab({
  type: "document-item",
  icon: <FileTextOutlined />,
  title: "知识库",
  viewer: DocumentItemsViewer,
});
