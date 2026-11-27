// 内置 Skill：桌面与移动共用同一份正文，经打包器以原文导入（?raw），故单独成入口。
import databaseSchemaReadme from "./database-schema.md?raw";
import knowledgeBaseReadme from "./knowledge-base.md?raw";
import markdownReadme from "./markdown.md?raw";
import mindmapReadme from "./mindmap.md?raw";
import queryDatabaseReadme from "./query-database.md?raw";
import { QUERY_DATABASE_REFERENCE } from "../../query-database";
import {
  USER_DOCS_SKILL_README,
  USER_DOCS_SKILL_RESOURCE_PATHS,
  loadUserDocsSkillResource,
} from "./user-docs.generated";

export interface InternalSkillDefinition {
  /** 唯一标识，兼作 Skill 目录名 */
  folderName: string;
  name: string;
  description: string;
  /** SKILL.md 的完整内容 */
  readmeContent: string;
  /** 可选的只读附属文件相对路径列表（如 references/*.md） */
  resourcePaths?: readonly string[];
  /** 按相对路径读取内置 Skill 的附属文件 */
  readResource?: (relativePath: string) => Promise<string | undefined>;
}

export const INTERNAL_SKILLS: readonly InternalSkillDefinition[] = [
  {
    folderName: "tau-docs",
    name: "Tau 使用文档",
    description:
      "解答 Tau 的功能用法、界面入口、快捷键、配置、同步、协作、插件、手机端与常见问题时使用；不用于检索用户自己的笔记内容。",
    readmeContent: USER_DOCS_SKILL_README,
    resourcePaths: USER_DOCS_SKILL_RESOURCE_PATHS,
    readResource: loadUserDocsSkillResource,
  },
  {
    folderName: "query-database",
    name: "查询数据库",
    description:
      "创建、修改或修复查询数据库的 DSL / JavaScript，或编辑正文中的 tau-query / tau-queryjs 查询块时使用。",
    readmeContent: `${queryDatabaseReadme}\n\n${QUERY_DATABASE_REFERENCE}`,
  },
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
      "查找、回顾或整理用户自己的笔记、划线、剪藏等知识库资料，或基于这些资料回答问题、引用来源时使用。",
    readmeContent: knowledgeBaseReadme,
  },
];
