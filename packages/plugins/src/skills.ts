/** 随插件打包的只读技能；正文可由构建工具从 SKILL.md 导入为字符串。 */
export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  invocation?: "auto" | "manual";
}
