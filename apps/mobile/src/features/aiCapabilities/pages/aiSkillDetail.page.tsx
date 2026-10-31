/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { createPageSchema, definePage, paramString, usePage } from "../../../router";
import { SkillDetailPage } from "../SkillDetailPage";

const schema = createPageSchema({ skillId: paramString() });

function AiSkillDetailScreen() {
  const { params } = usePage<typeof schema.type>();
  return <SkillDetailPage key={params.skillId} skillId={params.skillId} />;
}

export default definePage({
  key: "aiSkillDetail",
  match: "params",
  getId: params => params.skillId,
  params: schema.schema,
  component: AiSkillDetailScreen,
});
