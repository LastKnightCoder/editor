/**
 * MCP 服务器页 page 定义。
 */

import { definePage } from "@/page/definePage";
import { McpView } from "../views/McpView";

export default definePage({
  key: "mcp",
  match: "single",
  label: "MCP 服务器",
  status: "new",
  params: {},
  component: McpView,
});
