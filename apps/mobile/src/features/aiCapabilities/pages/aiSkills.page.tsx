/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { createPageSchema, definePage, paramOptional, paramString, usePage } from "../../../router";
import { SkillsPage } from "../SkillsPage";

const schema = createPageSchema({
  /** 只看某个插件或 Skill 包提供的 Skill（插件详情跳入） */
  sourceId: paramOptional(paramString()),
});

function AiSkillsScreen() {
  const { params } = usePage<typeof schema.type>();
  return <SkillsPage sourceId={params.sourceId} />;
}

export default definePage({
  key: "aiSkills",
  match: "params",
  getId: params => params.sourceId ?? "all",
  params: schema.schema,
  component: AiSkillsScreen,
});
