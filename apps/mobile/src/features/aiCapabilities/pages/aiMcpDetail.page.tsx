/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { createPageSchema, definePage, paramString, usePage } from "../../../router";
import { McpDetailPage } from "../McpDetailPage";

const schema = createPageSchema({ sourceId: paramString() });

function AiMcpDetailScreen() {
  const { params } = usePage<typeof schema.type>();
  return <McpDetailPage key={params.sourceId} sourceId={params.sourceId} />;
}

export default definePage({
  key: "aiMcpDetail",
  match: "params",
  getId: params => params.sourceId,
  params: schema.schema,
  component: AiMcpDetailScreen,
});
