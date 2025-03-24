import { FileTextOutlined } from "@ant-design/icons";
import { registerTab } from "../../TabRegistry";
import CardsViewer from "./CardsViewer";

// 注册卡片标签页
registerTab({
  type: "card",
  icon: <FileTextOutlined />,
  title: "卡片",
  viewer: CardsViewer,
});
