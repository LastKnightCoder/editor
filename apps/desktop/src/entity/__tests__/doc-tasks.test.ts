import { describe, expect, it } from "vitest";

import {
  docTaskTokenSpans,
  extractDocTasks,
  formatDocTaskDate,
  isAbsoluteDateHint,
  matchGroupToken,
  parseDocTaskText,
  resolveDocTaskDue,
} from "../doc-tasks";

const p = (text: string) => ({ type: "paragraph", children: [{ type: "formatted", text }] });
const item = (taskId: string | undefined, text: string, checked = false, nested?: unknown[]) => ({
  type: "check-list-item",
  checked,
  ...(taskId ? { taskId } : {}),
  children: nested ? [p(text), { type: "check-list", children: nested }] : [p(text)],
});
const list = (...children: unknown[]) => ({ type: "check-list", children });

const GROUPS = [
  { id: 1, title: "笔记" },
  { id: 2, title: "笔记软件开发" },
  { id: 3, title: "生活" },
];
// 2026-10-08 周四
const NOW = new Date(2026, 9, 8, 10);

describe("matchGroupToken", () => {
  it("长标题优先", () => {
    expect(matchGroupToken("整理 #笔记软件开发 文档", GROUPS)?.group.id).toBe(2);
    expect(matchGroupToken("整理 #笔记 文档", GROUPS)?.group.id).toBe(1);
  });

  it("全角井号也识别；未命中返回 null", () => {
    expect(matchGroupToken("交电费 ＃生活", GROUPS)?.token).toBe("＃生活");
    expect(matchGroupToken("看 #电影", GROUPS)).toBeNull();
  });
});

describe("parseDocTaskText", () => {
  it("摘除项目与日期，剩余为标题", () => {
    expect(parseDocTaskText("整理插件文档 #笔记软件开发 周五", GROUPS, NOW)).toEqual({
      title: "整理插件文档",
      groupId: 2,
      groupToken: "#笔记软件开发",
      dateHint: "周五",
    });
  });

  it("未命中的 #词留在标题里", () => {
    expect(parseDocTaskText("看 #电影", GROUPS, NOW)).toMatchObject({
      title: "看 #电影",
      groupId: null,
      dateHint: null,
    });
  });
});

describe("resolveDocTaskDue", () => {
  it("带年份的日期不看锚点；过去的日期保持在过去（不被当成明年）", () => {
    const past = new Date(2025, 0, 3).getTime();
    expect(resolveDocTaskDue("2025年1月3日", NOW.getTime())).toBe(past);
    expect(resolveDocTaskDue("2025-1-3", NOW.getTime())).toBe(past);
    expect(isAbsoluteDateHint("2025年1月3日")).toBe(true);
    expect(isAbsoluteDateHint("周五")).toBe(false);
  });

  it("非法日期不识别", () => {
    expect(resolveDocTaskDue("2026年2月30日", NOW.getTime())).toBeNull();
  });

  it("规范写法与解析往返一致", () => {
    const ts = new Date(2026, 9, 10).getTime();
    expect(formatDocTaskDate(ts)).toBe("2026年10月10日");
    expect(parseDocTaskText(`写公告 ${formatDocTaskDate(ts)}`, GROUPS, NOW)).toMatchObject({
      title: "写公告",
      dateHint: "2026年10月10日",
    });
  });
  it("相对日期按锚点换算", () => {
    expect(resolveDocTaskDue("周五", NOW.getTime())).toBe(new Date(2026, 9, 9).getTime());
    expect(resolveDocTaskDue("明天", NOW.getTime())).toBe(new Date(2026, 9, 9).getTime());
  });

  it("锚点不变则结果不随时间漂移", () => {
    const anchor = NOW.getTime();
    expect(resolveDocTaskDue("明天", anchor)).toBe(resolveDocTaskDue("明天", anchor));
  });

  it("没写日期为 null", () => {
    expect(resolveDocTaskDue(null, NOW.getTime())).toBeNull();
  });
});

describe("docTaskTokenSpans", () => {
  it("给出项目与日期在原文里的位置", () => {
    const text = "整理文档 #笔记软件开发 周五";
    const spans = docTaskTokenSpans(text, GROUPS, NOW);
    expect(spans).toEqual([
      { kind: "group", start: 5, end: 12, groupId: 2 },
      { kind: "date", start: 13, end: 15, hint: "周五" },
    ]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("#笔记软件开发");
  });

  it("项目名里的数字不被当成日期", () => {
    const groups = [{ id: 9, title: "5月发布" }];
    expect(docTaskTokenSpans("准备 #5月发布", groups, NOW)).toEqual([
      { kind: "group", start: 3, end: 8, groupId: 9 },
    ]);
  });

  it("带年份的日期优先", () => {
    const spans = docTaskTokenSpans("交 2026年10月10日", GROUPS, NOW);
    expect(spans).toEqual([{ kind: "date", start: 2, end: 13, hint: "2026年10月10日" }]);
  });
});

describe("extractDocTasks", () => {
  it("按文档序抽取，记录层级与父项", () => {
    const content = [
      p("本周："),
      list(
        item("a", "整理变更日志"),
        item("b", "回归测试 #笔记软件开发", false, [item("c", "日历拖拽", true)])
      ),
    ];
    const { tasks, missingIds } = extractDocTasks(content, GROUPS, NOW);
    expect(missingIds).toBe(0);
    expect(tasks.map(t => [t.taskId, t.depth, t.parentTaskId, t.order, t.checked])).toEqual([
      ["a", 0, null, 0, false],
      ["b", 0, null, 1, false],
      ["c", 1, "b", 2, true],
    ]);
    expect(tasks[1]).toMatchObject({ title: "回归测试", groupId: 2 });
  });

  it("嵌在其它块里的勾选项也收集", () => {
    const content = [{ type: "blockquote", children: [list(item("q", "引用里的任务"))] }];
    expect(extractDocTasks(content, GROUPS, NOW).tasks.map(t => t.taskId)).toEqual(["q"]);
  });

  it("缺 taskId 的项计数并跳过，子项挂到最近有 id 的祖先", () => {
    const content = [list(item(undefined, "无 id", false, [item("child", "子项")]))];
    const { tasks, missingIds } = extractDocTasks(content, GROUPS, NOW);
    expect(missingIds).toBe(1);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ taskId: "child", depth: 1, parentTaskId: null });
  });

  it("非数组正文返回空", () => {
    expect(extractDocTasks(null, GROUPS, NOW)).toEqual({ tasks: [], missingIds: 0 });
  });
});
