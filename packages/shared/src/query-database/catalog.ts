import type { QueryColumn, QueryColumnType, QuerySource } from "./types";

const field = (key: string, title: string, type: QueryColumnType): QueryColumn => ({
  key,
  title,
  type,
});
const common = [
  field("id", "编号", "text"),
  field("title", "标题", "text"),
  field("createdAt", "创建时间", "date"),
  field("updatedAt", "更新时间", "date"),
];
const content = [
  ...common,
  field("tags", "标签", "multiSelect"),
  field("wordCount", "字数", "number"),
  field("pinned", "置顶", "boolean"),
  field("source", "来源", "entity"),
  field("contentRef", "正文句柄", "json"),
];

export const QUERY_SOURCES: Record<QuerySource, { title: string; fields: QueryColumn[] }> = {
  cards: { title: "卡片", fields: content },
  articles: { title: "文章", fields: [...content, field("author", "作者", "text")] },
  documents: {
    title: "项目文档",
    fields: [
      ...content,
      field("parent", "上级", "text"),
      field("projectIds", "所属项目", "json"),
      field("kind", "类型", "text"),
    ],
  },
  projects: {
    title: "项目",
    fields: [
      ...common,
      field("archived", "归档", "boolean"),
      field("pinned", "置顶", "boolean"),
      field("documentCount", "根文档数", "number"),
      field("source", "来源", "entity"),
    ],
  },
  todos: {
    title: "待办",
    fields: [
      field("id", "编号", "text"),
      field("title", "待办", "text"),
      field("completed", "完成", "boolean"),
      field("archived", "归档", "boolean"),
      field("dueAt", "截止日期", "date"),
      field("listId", "清单", "text"),
      field("source", "来源", "entity"),
      field("recurrence", "重复规则", "json"),
    ],
  },
  calendar: {
    title: "日程",
    fields: [
      field("id", "编号", "text"),
      field("title", "日程", "text"),
      field("start", "开始", "date"),
      field("end", "结束", "date"),
      field("allDay", "全天", "boolean"),
      field("calendarId", "日历", "text"),
      field("kind", "来源类型", "text"),
      field("source", "来源", "entity"),
    ],
  },
  diary: {
    title: "日记",
    fields: [
      field("id", "编号", "text"),
      field("date", "日期", "date"),
      field("title", "日期", "text"),
      field("weather", "天气", "text"),
      field("mood", "心情", "text"),
      field("tags", "标签", "multiSelect"),
      field("wordCount", "字数", "number"),
      field("source", "来源", "entity"),
    ],
  },
  tables: { title: "普通数据库行", fields: [field("id", "编号", "text")] },
  contents: {
    title: "按句柄读取正文",
    fields: [
      field("id", "正文身份", "text"),
      field("markdown", "正文", "text"),
      field("nodes", "正文结构", "json"),
      field("wordCount", "字数", "number"),
    ],
  },
  whiteboards: {
    title: "白板",
    fields: [
      ...common,
      field("tags", "标签", "multiSelect"),
      field("description", "说明", "text"),
      field("pageCount", "页数", "number"),
      field("source", "来源", "entity"),
    ],
  },
  notebooks: {
    title: "Notebook",
    fields: [
      ...common,
      field("archived", "归档", "boolean"),
      field("pinned", "置顶", "boolean"),
      field("resourceCount", "资料数量", "number"),
    ],
  },
  materials: {
    title: "材料",
    fields: [
      ...common,
      field("kind", "类型", "text"),
      field("quote", "摘录", "text"),
      field("note", "笔记", "text"),
      field("url", "网址", "text"),
    ],
  },
  chats: {
    title: "对话信息",
    fields: [
      ...common,
      field("scene", "场景", "text"),
      field("messageCount", "消息数量", "number"),
      field("archived", "归档", "boolean"),
    ],
  },
};

export function isQuerySource(source: unknown): source is QuerySource {
  return typeof source === "string" && Object.hasOwn(QUERY_SOURCES, source);
}
