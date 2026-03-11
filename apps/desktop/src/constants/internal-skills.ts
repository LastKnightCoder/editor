import type { InternalSkill } from "@/types";

// 通过 raw 导入 markdown 文件
import markdownReadme from "./internal-skills/markdown.md?raw";
import mindmapReadme from "./internal-skills/mindmap.md?raw";
import tikzReadme from "./internal-skills/tikz.md?raw";
import typstReadme from "./internal-skills/typst.md?raw";
import knowledgeBaseReadme from "./internal-skills/knowledge-base.md?raw";

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
  [
    "knowledge-base",
    {
      folderName: "knowledge-base",
      name: "知识库搜索与引用",
      description:
        "通过 search_knowledge 工具搜索用户的个人知识库（卡片、文章、项目条目、文档条目、日记、周记、月记）。" +
        "系统支持向量语义检索，query 应使用完整自然语言句子而非简短关键词，以获得最佳检索效果。" +
        "当用户提问涉及其已有笔记/资料、要求查找/回顾/整理知识、使用了「我的笔记」「找一下」「我之前写的」等表述时，应主动加载此 Skill 并调用搜索。" +
        "引用搜索结果时必须使用 :ref[显示文本]{id=ID type=类型} 语法。" +
        "加载 SKILL.md 获取完整的搜索策略、引用规范和最佳实践。",
      readmeContent: knowledgeBaseReadme,
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
