/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { createPageSchema, definePage, paramOptional, paramString, usePage } from "../../../router";
import { McpServerPage } from "../McpServerPage";

const schema = createPageSchema({
  /** 省略为添加新服务器 */
  serverId: paramOptional(paramString()),
});

function AiMcpServerScreen() {
  const { params } = usePage<typeof schema.type>();
  return <McpServerPage key={params.serverId ?? "new"} serverId={params.serverId} />;
}

export default definePage({
  key: "aiMcpServer",
  match: "params",
  getId: params => params.serverId ?? "new",
  params: schema.schema,
  component: AiMcpServerScreen,
});
