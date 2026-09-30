/**
 * Skill 编辑页 page 定义：params 按 Skill 目录去重——同一个 Skill 重复进入激活同一实例。
 */

import { createPageSchema, paramString } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { SkillEditView } from "../views/SkillEditView";

const schema = createPageSchema({ path: paramString() });

export default definePage({
  key: "skill-edit",
  match: "params",
  getId: params => `skill-${params.path}`,
  label: "编辑 Skill",
  params: schema.schema,
  component: SkillEditView,
});
