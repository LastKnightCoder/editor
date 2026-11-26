import { appMessages } from "@/app/i18n/messages";
/**
 * Skill 页 page 定义。
 */

import { definePage } from "@/page/definePage";
import { SkillsView } from "../views/SkillsView";

export default definePage({
  key: "skills",
  match: "single",
  label: appMessages.ref("nav.skills"),
  params: {},
  component: SkillsView,
});
