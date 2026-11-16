/**
 * Skill 页 page 定义。
 */

import { definePage } from "@/page/definePage";
import { SkillsView } from "../views/SkillsView";

export default definePage({
  key: "skills",
  match: "single",
  label: "Skill",
  params: {},
  component: SkillsView,
});
