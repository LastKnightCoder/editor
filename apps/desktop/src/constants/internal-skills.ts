import type { InternalSkill } from "@/types";

// 通过 raw 导入 markdown 文件
import markdownReadme from "./internal-skills/markdown.md?raw";
import mindmapReadme from "./internal-skills/mindmap.md?raw";
import tikzReadme from "./internal-skills/tikz.md?raw";
import typstReadme from "./internal-skills/typst.md?raw";

// 内部 Skill 注册表
const internalSkillRegistry = new Map<string, InternalSkill>([
  [
    "markdown",
    {
      folderName: "markdown",
      name: "Markdown 扩展语法",
      description: "编辑或创建文档时使用 Markdown 扩展语法",
      readmeContent: markdownReadme,
      isInternal: true,
    },
  ],
  [
    "mindmap",
    {
      folderName: "mindmap",
      name: "思维导图",
      description: "创建思维导图、脑图、知识图谱或组织结构图",
      readmeContent: mindmapReadme,
      isInternal: true,
    },
  ],
  [
    "tikz",
    {
      folderName: "tikz",
      name: "TikZ 绘图",
      description:
        "渲染 LaTeX 和 TikZ 图表，包括函数图、电路图、化学结构图、交换图等",
      readmeContent: tikzReadme,
      isInternal: true,
    },
  ],
  [
    "typst",
    {
      folderName: "typst",
      name: "Typst 绘图",
      description:
        "使用 Typst 语法渲染图表，包括函数图、电路图、流程图、甘特图等",
      readmeContent: typstReadme,
      isInternal: true,
    },
  ],
]);

export const isInternalSkill = (folderName: string): boolean =>
  internalSkillRegistry.has(folderName);

export const getInternalSkill = (
  folderName: string,
): InternalSkill | undefined => internalSkillRegistry.get(folderName);

export const getAllInternalSkills = (): InternalSkill[] =>
  Array.from(internalSkillRegistry.values());

export const getInternalSkillFolderNames = (): string[] =>
  Array.from(internalSkillRegistry.keys());
