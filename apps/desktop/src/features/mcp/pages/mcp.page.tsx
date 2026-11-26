import { appMessages } from "@/app/i18n/messages";
/**
 * MCP 服务器页 page 定义。
 */

import { definePage } from "@/page/definePage";
import { McpView } from "../views/McpView";

export default definePage({
  key: "mcp",
  match: "single",
  label: appMessages.ref("nav.mcp"),
  params: {},
  component: McpView,
});
