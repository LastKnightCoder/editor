import { describe, expect, it } from "vitest";
import {
  TASK_READ_SCHEMAS,
  TASK_WRITE_SCHEMAS,
  taskToolSchema,
  validateTaskTool,
} from "@tau/shared/task-assistant";

describe("助理工具输入契约", () => {
  it("共享 schema 拒绝未知字段、无效日期、混合身份和过大批次", () => {
    expect(() => validateTaskTool("query_todos", { sql: "DELETE FROM todo_item" })).toThrow(
      "未知字段"
    );
    expect(() =>
      validateTaskTool("query_todos", { start: "2026-02-30", end: "2026-03-01" })
    ).toThrow();
    expect(() =>
      validateTaskTool("update_todo", {
        items: [
          {
            requestId: "a",
            taskRef: { kind: "todo", todoId: 1, contentId: 2, createdAt: 1 },
            revision: "r",
            patch: { title: "测试" },
          },
        ],
      })
    ).toThrow("混用");
    expect(() =>
      validateTaskTool("create_todo", {
        items: Array.from({ length: 51 }, (_, index) => ({
          requestId: String(index),
          title: "测试",
        })),
      })
    ).toThrow("数量");
    expect(() =>
      validateTaskTool("update_todo", {
        items: [
          {
            requestId: "a",
            taskRef: { kind: "todo", todoId: 1, createdAt: 1 },
            revision: "r",
            patch: { dueAt: null },
          },
        ],
      })
    ).not.toThrow();
  });
  it("工具定义数量和上下文体积保持有界", () => {
    const names = [...Object.keys(TASK_READ_SCHEMAS), ...Object.keys(TASK_WRITE_SCHEMAS)] as Array<
      keyof typeof TASK_READ_SCHEMAS | keyof typeof TASK_WRITE_SCHEMAS
    >;
    expect(names).toHaveLength(13);
    const schemas = JSON.stringify(names.map(name => ({ name, parameters: taskToolSchema(name) })));
    expect(new TextEncoder().encode(schemas).length).toBeLessThan(32_768);
    expect(schemas).not.toContain('"type":"any"');
    expect(schemas).not.toContain('"format":"task-');
  });
});
