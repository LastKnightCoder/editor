// 内置 Skill：桌面与移动共用同一份正文，经打包器以原文导入（?raw），故单独成入口。
import databaseSchemaReadme from "./database-schema.md?raw";
import knowledgeBaseReadme from "./knowledge-base.md?raw";
import markdownReadme from "./markdown.md?raw";
import mindmapReadme from "./mindmap.md?raw";

export interface InternalSkillDefinition {
  /** 唯一标识，兼作 Skill 目录名 */
  folderName: string;
  name: string;
  description: string;
  /** SKILL.md 的完整内容 */
  readmeContent: string;
}

export const INTERNAL_SKILLS: readonly InternalSkillDefinition[] = [
  {
    folderName: "database-schema",
    name: "主数据库结构与只读 SQL 查询",
    description: "说明主 SQLite 数据库的表结构、字段关系和安全查询方式，供 sql_query 使用。",
    readmeContent: databaseSchemaReadme,
  },
  {
    folderName: "markdown",
    name: "Markdown 扩展语法",
    description: "编辑或创建文档时使用 Markdown 扩展语法",
    readmeContent: markdownReadme,
  },
  {
    folderName: "mindmap",
    name: "思维导图",
    description: "创建思维导图、脑图、知识图谱或组织结构图",
    readmeContent: mindmapReadme,
  },
  {
    folderName: "knowledge-base",
    name: "知识库搜索与引用",
    description:
      "通过 search_knowledge 工具搜索用户的个人知识库（卡片、文章、项目条目、日记）。" +
      "query 只写要查找的主题内容（如「JavaScript this 的用法」），不要包含对话指令或「请搜索」「我的笔记」等非检索内容。" +
      "当用户提问涉及其已有笔记/资料、要求查找/回顾/整理知识、使用了「我的笔记」「找一下」「我之前写的」等表述时，应主动加载此 Skill 并调用搜索。" +
      "引用搜索结果时必须使用 :ref[显示文本]{id=ID type=类型} 语法。" +
      "加载 SKILL.md 获取完整的搜索策略、引用规范和最佳实践。",
    readmeContent: knowledgeBaseReadme,
  },
];
