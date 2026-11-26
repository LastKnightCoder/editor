import { Code } from "lucide-react";
import { defineElement, defineExtension, setOrInsertNode } from "@tau/editor";
import { queryDatabaseElementDefinition } from "../element-definitions";
import type { QueryDatabaseElement } from "./types";
import QueryDatabaseBlock from "./QueryDatabaseBlock";

const queryDatabaseExtension = defineExtension({
  id: "host.query-database",
  elements: [
    defineElement<QueryDatabaseElement>({
      ...queryDatabaseElementDefinition,
      render: props => <QueryDatabaseBlock {...props} />,
      // 块上留白 1.1em，手柄（1.8em 高）与 46px 视图栏的标题行垂直居中
      drag: { self: true, children: true, handleClassName: "top-[calc(1.1em+23px-0.9em)]" },
    }),
  ],
  blockPanel: [
    {
      icon: Code,
      title: "查询数据库",
      description: "从卡片、待办、日记等实时汇总成表",
      keywords: ["query", "dataview", "查询", "数据库"],
      onClick: editor =>
        setOrInsertNode(editor, {
          type: "query-database",
          id: crypto.randomUUID(),
          code: "",
          language: "dsl",
          children: [{ type: "formatted", text: "" }],
        }),
    },
  ],
});
export default queryDatabaseExtension;
