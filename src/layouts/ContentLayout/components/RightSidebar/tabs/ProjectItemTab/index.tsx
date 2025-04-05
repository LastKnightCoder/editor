import { ProjectOutlined } from "@ant-design/icons";
import { registerTab } from "../../TabRegistry";
import ProjectItemsViewer from "./ProjectItemsViewer";

// 注册项目标签页
registerTab({
  type: "project-item",
  icon: <ProjectOutlined />,
  title: "项目",
  viewer: ProjectItemsViewer,
});
