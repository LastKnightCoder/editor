import type { FormattedText } from "@tau/editor";

/** 对话输入框里 `$` 点名的 Skill 芯片（行内 void） */
export interface SkillRefElement {
  type: "skill-ref";
  folderName: string;
  name: string;
  children: FormattedText[];
}
