import { describe, expect, it, vi, afterEach } from "vitest";
import { executeQuery, parseQuery, collectQueryData } from "../dsl";
import { validateQueryResult } from "../result";
import { createQuerySession } from "../session";
import type { QueryContext, QueryResult } from "../types";
import { querySerializedBytes } from "../types";

const context: QueryContext = {
  now: 1000,
  today: "2026-11-25",
  timeZone: "Asia/Shanghai",
  params: {},
};
const result: QueryResult = { columns: [{ key: "title", title: "内容", type: "text" }], rows: [] };
afterEach(() => vi.useRealTimers());

describe("查询语言契约", () => {
  it("年月筛选按日期和调用方时区取值，年末与跨月不落入错误范围", async () => {
    const output = await executeQuery(
      parseQuery(
        "TABLE id FROM diary WHERE year(date)=year(today()) AND month(date)=month(today())"
      ),
      async () => ({
        items: [
          { id: "same", date: "2026-11-30" },
          { id: "next", date: "2026-12-01" },
          { id: "other-year", date: "2025-11-26" },
          { id: "local-next-month", date: "2026-11-30T23:30:00Z" },
        ],
      }),
      context
    );
    expect(output.rows.map(row => row.id)).toEqual(["same"]);
  });
  it("字符串按 JSON 转义还原 Unicode 和控制字符，迁移生成的标签不改变含义", async () => {
    const tag = '引号"\\\b\f\u0000中😀';
    const output = await executeQuery(
      parseQuery(`TABLE id FROM cards WHERE hasTag(${JSON.stringify(tag)})`),
      async () => ({
        items: [
          { id: "exact", tags: [tag] },
          { id: "other", tags: ["other"] },
        ],
      }),
      context
    );
    expect(output.rows.map(row => row.id)).toEqual(["exact"]);
  });
  it("序列化预算按 UTF-8 字节计算，包含中文与代理对字符", () => {
    expect(querySerializedBytes({ text: "中😀" })).toBe(18);
  });
  it("日期比较与排序按真实时间处理，不受字符串格式与时区偏移影响", async () => {
    const output = await executeQuery(
      parseQuery(
        'TABLE title, updatedAt FROM cards WHERE NOT title = "排除" AND updatedAt >= toDate("2026-11-25T00:00:00Z") SORT updatedAt ASC'
      ),
      async () => ({
        items: [
          { id: "1", title: "稍晚", updatedAt: "2026-11-25T10:00:00+08:00" },
          { id: "2", title: "最早", updatedAt: Date.parse("2026-11-25T00:30:00Z") },
          { id: "3", title: "排除", updatedAt: "2026-11-25T01:00:00Z" },
          { id: "4", title: "之前", updatedAt: "2026-11-24T23:00:00Z" },
        ],
      }),
      context
    );
    expect(output.rows.map(row => row.id)).toEqual(["2", "1"]);
  });
  it("没有匹配数据时仍由目录与显式声明产生完整列类型", async () => {
    const output = await executeQuery(
      parseQuery(
        'TABLE title AS "内容", updatedAt, wordCount / 500 AS "阅读分钟" TYPE number FROM cards WHERE hasTag("读书")'
      ),
      async () => ({ items: [] }),
      context
    );
    expect(output.columns.map(column => [column.key, column.type])).toEqual([
      ["title", "text"],
      ["updatedAt", "date"],
      ["阅读分钟", "number"],
    ]);
    expect(output.rows).toEqual([]);
  });
  it("字符串里的关键字与逗号不会被当作子句", async () => {
    const output = await executeQuery(
      parseQuery('TABLE title AS "FROM, WHERE" FROM cards WHERE contains(title, "SORT, FROM")'),
      async () => ({
        items: [
          { id: "c:1", title: "SORT, FROM" },
          { id: "c:2", title: "其他" },
        ],
      }),
      context
    );
    expect(output.rows.map(row => row.id)).toEqual(["c:1"]);
  });
  it("先完成所有分页再分组聚合与排序", async () => {
    const output = await executeQuery(
      parseQuery(
        'TABLE completed, count() AS "数量", sum(wordCount) AS "字数" FROM cards GROUP BY completed SORT 字数 DESC'
      ),
      async request =>
        request.cursor
          ? {
              items: [{ id: "3", completed: false, wordCount: 10 }],
              fields: [
                { key: "completed", title: "完成", type: "boolean" },
                { key: "wordCount", title: "字数", type: "number" },
              ],
            }
          : {
              items: [
                { id: "1", completed: false, wordCount: 20 },
                { id: "2", completed: true, wordCount: 5 },
              ],
              cursor: "next",
              fields: [
                { key: "completed", title: "完成", type: "boolean" },
                { key: "wordCount", title: "字数", type: "number" },
              ],
            },
      context
    );
    expect(output.rows.map(row => row.values)).toEqual([
      { completed: false, 数量: 2, 字数: 30 },
      { completed: true, 数量: 1, 字数: 5 },
    ]);
  });
  it("空集合聚合仍返回正确计数，混入非分组字段则失败", async () => {
    const output = await executeQuery(
      parseQuery('TABLE count() AS "数量" FROM cards'),
      async () => ({ items: [] }),
      context
    );
    expect(output.rows[0].values).toEqual({ 数量: 0 });
    await expect(
      executeQuery(
        parseQuery('TABLE title, count() AS "数量" FROM cards'),
        async () => ({ items: [] }),
        context
      )
    ).rejects.toThrow("分组");
    await expect(
      executeQuery(
        parseQuery('TABLE title + count() AS "混合" FROM cards'),
        async () => ({ items: [] }),
        context
      )
    ).rejects.toThrow("分组");
    await expect(
      executeQuery(
        parseQuery('TABLE sum(count()) AS "嵌套" FROM cards'),
        async () => ({ items: [] }),
        context
      )
    ).rejects.toThrow("嵌套");
  });
  it("声明类型不会把文本静默转换为数值", async () => {
    await expect(
      executeQuery(
        parseQuery("TABLE title TYPE number FROM cards"),
        async () => ({ items: [{ id: "1", title: "文字" }] }),
        context
      )
    ).rejects.toThrow("number");
    const output = await executeQuery(
      parseQuery('TABLE toNumber(title) AS "数值" TYPE number FROM cards'),
      async () => ({ items: [{ id: "1", title: "42" }] }),
      context
    );
    expect(output.rows[0].values.数值).toBe(42);
  });
  it("空结果也拒绝拼错的字段，不接受未消费的语句", async () => {
    await expect(
      executeQuery(parseQuery("TABLE missing FROM cards"), async () => ({ items: [] }), context)
    ).rejects.toThrow("missing");
    expect(() => parseQuery("TABLE title FROM cards DELETE cards")).toThrow("DELETE");
    await expect(
      collectQueryData(async () => ({ items: [], cursor: "same" }), "cards")
    ).rejects.toThrow("分页");
  });
  it("拒绝重复身份、非有限数字与不符合字段类型的结果", () => {
    expect(() =>
      validateQueryResult({
        ...result,
        rows: [
          { id: "1", values: {} },
          { id: "1", values: {} },
        ],
      })
    ).toThrow("唯一");
    expect(() =>
      validateQueryResult({
        columns: [{ key: "n", title: "数字", type: "number" }],
        rows: [{ id: "1", values: { n: Infinity } }],
      })
    ).toThrow("number");
    expect(() =>
      validateQueryResult({
        columns: [{ key: "d", title: "日期", type: "date" }],
        rows: [{ id: "1", values: { d: "不是日期" } }],
      })
    ).toThrow("date");
  });
});

describe("全量刷新调度", () => {
  it("运行期间多次失效只追加一轮，过时结果不发布", async () => {
    vi.useFakeTimers();
    const pending: ((result: QueryResult) => void)[] = [];
    const published: QueryResult[] = [];
    const run = vi.fn(() => ({
      result: new Promise<QueryResult>(resolve => pending.push(resolve)),
      cancel() {},
    }));
    const session = createQuerySession({
      run,
      publish: value => published.push(value),
      fail: error => {
        throw error;
      },
      loading() {},
    });
    session.invalidate();
    session.invalidate();
    await vi.advanceTimersByTimeAsync(250);
    expect(run).toHaveBeenCalledTimes(1);
    session.invalidate();
    session.invalidate();
    pending[0](result);
    await vi.advanceTimersByTimeAsync(250);
    expect(published).toEqual([]);
    expect(run).toHaveBeenCalledTimes(2);
    pending[1](result);
    await vi.advanceTimersByTimeAsync(0);
    expect(published).toEqual([result]);
    session.dispose();
  });
  it("隐藏时取消执行，恢复后重读，离开后拒绝迟到结果", async () => {
    vi.useFakeTimers();
    let finish: (result: QueryResult) => void = () => {};
    const cancel = vi.fn();
    const publish = vi.fn();
    const run = vi.fn(() => ({
      result: new Promise<QueryResult>(resolve => {
        finish = resolve;
      }),
      cancel,
    }));
    const session = createQuerySession({ run, publish, fail() {}, loading() {} });
    session.invalidate();
    await vi.advanceTimersByTimeAsync(250);
    session.setActive(false);
    finish(result);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cancel).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    session.setActive(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(run).toHaveBeenCalledTimes(2);
    session.dispose();
    finish(result);
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
