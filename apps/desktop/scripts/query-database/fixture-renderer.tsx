import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { startQuery } from "@tau/shared/query-database/client";
import {
  QUERY_LIMITS,
  QUERY_SOURCES,
  type QueryDefinition,
  type QuerySource,
} from "@tau/shared/query-database";
import { createQueryReader } from "../../src/features/shared/query-database/read";
import { useQueryDatabase } from "../../src/features/shared/query-database/useQueryDatabase";
import useSettingStore from "../../src/stores/useSettingStore";
import { rememberDatabaseConnection } from "../../src/services/command-context";
import type { DatabaseConnection } from "../../src/types/database-connection";
import type {
  FixtureInfo,
  FixtureInspection,
  FixtureSample,
  FixtureDiaryBody,
} from "./fixture-types";

const bridge = window.electron;
const results: {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  metrics?: Record<string, number>;
}[] = [];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const context = {
  now: Date.now(),
  today: "2026-11-25",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  params: {},
};
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
async function scenario(name: string, operation: () => Promise<void | Record<string, number>>) {
  const start = performance.now();
  try {
    const metrics = await operation();
    results.push({
      name,
      ok: true,
      ms: Math.round(performance.now() - start),
      ...(metrics ? { metrics } : {}),
    });
  } catch (error) {
    results.push({
      name,
      ok: false,
      ms: Math.round(performance.now() - start),
      detail:
        error instanceof Error ? error.message.replace(/「[^」]*」/g, "「字段」") : "查询失败",
    });
  }
  console.log("QUERY_CASE:" + JSON.stringify(results.at(-1)));
}
async function connect(name: string, force = false, source?: string) {
  const connection = await bridge.invoke<DatabaseConnection>(
    "create-or-connect-database",
    name,
    force,
    "normal",
    source
  );
  rememberDatabaseConnection(connection);
  useSettingStore.setState(state => ({
    ...state,
    inited: true,
    setting: { ...state.setting, database: { ...state.setting.database, active: name } },
  }));
  return connection;
}
async function run(definition: QueryDefinition, params = definition.params ?? {}) {
  const name = useSettingStore.getState().setting.database.active;
  const signal = new AbortController();
  return startQuery({
    definition,
    context: { ...context, params },
    read: createQueryReader(name, undefined, signal.signal),
  }).result;
}
let state: ReturnType<typeof useQueryDatabase> | undefined;
export function Probe({ definition }: { definition: QueryDefinition }) {
  const current = useQueryDatabase(definition);
  useEffect(() => {
    state = current;
  });
  return <div />;
}
async function until(checker: () => boolean, message: string, timeout = 15_000) {
  const stop = performance.now() + timeout;
  while (performance.now() < stop) {
    if (checker()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function verifyQueryDataStress() {
  await connect("data.db");
  const info = await bridge.invoke<FixtureInfo>("query-stress:info");
  const bulkSize = info.bulkSize;
  const outSize = Math.floor(bulkSize / 2);
  const remaining = bulkSize - outSize;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const baseline = info.baseline;
  const unexpected: string[] = [];
  window.addEventListener("unhandledrejection", event =>
    unexpected.push(String(event.reason?.name ?? "rejection"))
  );
  window.addEventListener("error", event => unexpected.push(event.error?.name ?? "error"));
  for (const [index, migration] of (info.migrations ?? []).entries())
    await scenario(`migration:legacy-${index + 1}`, async () => {
      const detail = await bridge.invoke<{
        table: { query: { definition: QueryDefinition }; columns: unknown[]; rows: unknown[] };
      }>("data-table:get-detail", migration.tableId);
      const result = await run(detail.table.query.definition);
      check(
        equal(result.rows.map(row => row.id).sort(), migration.ids),
        "迁移后的来源范围与独立 SQL 不一致"
      );
      check(
        detail.table.columns.length === 0 && detail.table.rows.length === 0,
        "迁移后仍持久化旧列或旧行"
      );
    });
  if (info.migrations?.length)
    await scenario("migration:source-records-unchanged", async () => {
      check(info.migrationSourceUnchanged, "迁移修改了源业务记录");
    });
  for (const source of Object.keys(info.expected))
    await scenario(`real-source:${source}`, async () => {
      const result = await run({
        version: 1,
        language: "dsl",
        code: `TABLE ${QUERY_SOURCES[source as QuerySource].fields.map(field => field.key).join(",")} FROM ${source}`,
      });
      const ids = result.rows.map(row => row.id).sort();
      check(equal(ids, info.expected[source as QuerySource]), "源身份与 SQL 对账不一致");
      check(result.columns[0].type === "text", "编号类型错误");
    });
  await scenario("real-source:todos", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE id, title, completed, dueAt, recurrence FROM todos",
    });
    check(new Set(result.rows.map(row => row.id)).size === result.rows.length, "待办身份重复");
  });
  await scenario("real-source:calendar", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE id, title, start, end, allDay FROM calendar",
      params: { view: "stored" },
    });
    check(result.rows.length > 0, "真实日程为空");
  });
  for (const [index, table] of info.tables.entries())
    await scenario(`real-source:table-${index + 1}`, async () => {
      const fields = [
        "id",
        ...table.columns
          .filter((key: string) => key !== "id")
          .map((key: string, index: number) => `field(${JSON.stringify(key)}) AS c${index}`),
      ];
      const result = await run({
        version: 1,
        language: "dsl",
        code: `TABLE ${fields.join(",")} FROM tables`,
        params: { tableId: table.id },
      });
      check(equal(result.rows.map(row => row.id).sort(), table.ids), "普通表行身份不一致");
    });
  if (info.content)
    await scenario("real-source:contents", async () => {
      const result = await run({
        version: 1,
        language: "dsl",
        code: "TABLE id, nodes TYPE json FROM contents",
        params: { ...info.content, format: "nodes" },
      });
      check(result.rows.length === 1 && Array.isArray(result.rows[0].values.nodes), "正文读取失败");
    });
  if (info.content)
    await scenario("real-source:contents-markdown", async () => {
      const result = await run({
        version: 1,
        language: "dsl",
        code: "TABLE id, markdown FROM contents",
        params: info.content,
      });
      check(
        result.rows.length === 1 && typeof result.rows[0].values.markdown === "string",
        "正文 Markdown 读取失败"
      );
    });
  await scenario("real-query:project-document-join", async () => {
    const result = await run({
      version: 1,
      language: "javascript",
      code: `const projects=await data.projects.collect();
const documents=await data.documents.collect();
return {
  columns:[{key:"count",title:"文档数",type:"number"}],
  rows:projects.map(project=>({id:project.id,values:{
    count:documents.filter(document=>document.projectIds.includes(Number(project.source.id))).length
  }}))
};`,
    });
    const actual = new Map(result.rows.map(row => [row.id, row.values.count]));
    check(actual.size === info.projectDocumentCounts.length, "项目关联查询遗漏项目");
    check(
      info.projectDocumentCounts.every(row => actual.get(row.id) === row.count),
      "项目文档关联计数错误"
    );
  });
  await scenario("real-query:group-and-aggregate", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE pinned,count() AS count FROM cards GROUP BY pinned SORT pinned ASC",
    });
    check(
      equal(
        result.rows.map(row => ({ pinned: Number(row.values.pinned), count: row.values.count })),
        info.pinnedGroups
      ),
      "分组聚合与真实 SQL 对账不一致"
    );
  });
  await scenario("read-only:all-sources", async () => {
    const after = await bridge.invoke<FixtureInspection>("query-stress:inspect");
    check(equal(after.snapshot, baseline), "读取改变了主库记录");
    check(after.quickCheck === "ok", "SQLite 完整性失败");
  });
  const extra = await bridge.invoke<{ notebookId: string; groupId: number }>(
    "query-stress:seed-more"
  );
  await scenario("fixture:notebook-nonempty", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE id,title,resourceCount FROM notebooks",
    });
    check(
      result.rows.some(row => row.id === extra.notebookId),
      "非空 Notebook 未返回"
    );
  });
  await scenario("fixture:todos-and-series", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE id,title,completed,recurrence FROM todos",
      params: { groupId: extra.groupId, source: "todo" },
    });
    check(result.rows.length === 4, "待办与重复系列遗漏");
    check(
      result.rows.every(row => row.values.completed === false),
      "系列完成状态错误"
    );
  });
  await scenario("fixture:recurrence-occurrences", async () => {
    const result = await run({
      version: 1,
      language: "dsl",
      code: "TABLE id,title,completed FROM todos",
      params: {
        groupId: extra.groupId,
        source: "todo",
        view: "occurrences",
        start: "2026-11-10",
        end: "2026-11-12",
      },
    });
    check(
      result.rows.length === 3 && result.rows.every(row => row.id.includes("@")),
      "重复实例数量或身份错误"
    );
  });
  const definition: QueryDefinition = {
    version: 1,
    language: "dsl",
    code: `TABLE title, tags, wordCount, updatedAt FROM cards WHERE hasTag("${info.marker}")`,
  };
  await scenario("live:empty", async () => {
    root.render(<Probe definition={definition} />);
    await until(() => !!state?.result && !state.loading, "空结果未完成");
    check(state?.result?.rows.length === 0, "初始范围非空");
  });
  await scenario("live:create", async () => {
    await bridge.invoke("query-stress:mutate", "create");
    await until(() => state?.result?.rows.length === 1 && !state.loading, "新增未自动同步");
  });
  await scenario("live:body", async () => {
    const before = state?.result?.rows[0].values.wordCount;
    await bridge.invoke("query-stress:mutate", "body");
    await until(
      () => state?.result?.rows[0]?.values.wordCount !== before && !state?.loading,
      "正文修改未同步"
    );
  });
  await scenario("live:tag-leave", async () => {
    await bridge.invoke("query-stress:mutate", "tags", false);
    await until(() => state?.result?.rows.length === 0 && !state.loading, "移出标签范围未同步");
  });
  await scenario("live:child-tag-enter", async () => {
    await bridge.invoke("query-stress:mutate", "tags", "child");
    await until(() => state?.result?.rows.length === 1 && !state.loading, "子标签未进入范围");
  });
  await scenario("live:delete", async () => {
    await bridge.invoke("query-stress:mutate", "delete");
    await until(() => state?.result?.rows.length === 0 && !state.loading, "删除未同步");
  });
  const samples = await bridge.invoke<FixtureSample[]>("query-stress:live-samples");
  for (const sample of samples)
    await scenario(`live:source-${sample.source}`, async () => {
      const before = state?.result;
      const expression = sample.source === "diary" ? "toText(tags)" : "title";
      const query: QueryDefinition = {
        version: 1,
        language: "dsl",
        code: `TABLE id, ${expression} AS changed FROM ${sample.source} WHERE id = ${JSON.stringify(sample.id)}`,
        params: sample.params,
      };
      root.render(<Probe definition={query} />);
      await until(
        () => state?.result !== before && state?.result?.rows.length === 1 && !state.loading,
        "来源查询未就绪"
      );
      const target = info.marker + "-changed-" + sample.source;
      if (sample.source === "diary")
        await bridge.invoke("update-diary-segment", {
          segmentId: sample.diarySegmentId,
          tags: [target],
        });
      else await bridge.invoke("query-stress:mutate-source", sample.source, target);
      await until(
        () =>
          Boolean(
            state?.result?.rows.some(row =>
              String(row.values[state?.result?.columns[1]?.key ?? "changed"]).includes(target)
            )
          ) && !state?.loading,
        "来源修改未自动同步"
      );
    });
  if (samples.some((sample: { source: string }) => sample.source === "todos"))
    await scenario("live:todo-second-connection", async () => {
      const sample = samples.find((sample: { source: string }) => sample.source === "todos");
      check(sample, "待办夹具不存在");
      const before = state?.result;
      root.render(
        <Probe
          definition={{
            version: 1,
            language: "dsl",
            code: `TABLE id,title FROM todos WHERE id=${JSON.stringify(sample.id)}`,
            params: sample.params,
          }}
        />
      );
      await until(
        () => state?.result !== before && state?.result?.rows.length === 1 && !state.loading,
        "待办查询未就绪"
      );
      const target = info.marker + "-other-connection";
      await bridge.invoke("query-stress:mutate-source", "todos", target, true);
      await until(
        () => state?.result?.rows[0]?.values.title === target && !state.loading,
        "另一连接提交未同步"
      );
    });
  if (samples.some((sample: { source: string }) => sample.source === "diary"))
    await scenario("live:diary-body", async () => {
      const sample = samples.find((sample: { source: string }) => sample.source === "diary");
      check(sample, "日记夹具不存在");
      const before = state?.result;
      root.render(
        <Probe
          definition={{
            version: 1,
            language: "dsl",
            code: `TABLE id,wordCount FROM diary WHERE id=${JSON.stringify(sample.id)}`,
          }}
        />
      );
      await until(
        () => state?.result !== before && state?.result?.rows.length === 1 && !state.loading,
        "日记查询未就绪"
      );
      const words = state?.result?.rows[0].values.wordCount;
      const body = await bridge.invoke<FixtureDiaryBody>("query-stress:diary-body");
      await bridge.invoke("content:update", body.contentId, {
        content: body.content,
        contracts: body.contracts,
        expectedRevision: body.revision,
      });
      await until(
        () => state?.result?.rows[0]?.values.wordCount !== words && !state?.loading,
        "日记正文修改未同步"
      );
    });
  if (samples.some((sample: { source: string }) => sample.source === "diary"))
    await scenario("live:diary-projected-body", async () => {
      const words = state?.result?.rows[0]?.values.wordCount;
      const body = await bridge.invoke<FixtureDiaryBody>("query-stress:diary-body");
      await bridge.invoke(
        "query-stress:diary-projected-body",
        body.contentId,
        body.content,
        body.revision
      );
      await until(
        () => state?.result?.rows[0]?.values.wordCount !== words && !state?.loading,
        "通用正文写入未通知所属日记"
      );
    });
  root.render(<Probe definition={definition} />);
  await until(
    () =>
      Boolean(state?.result?.columns.some(column => column.key === "wordCount")) &&
      state?.result?.rows.length === 0 &&
      !state?.loading,
    "卡片查询未恢复"
  );
  await scenario(`live:bulk-${bulkSize}`, async () => {
    await bridge.invoke("query-stress:mutate", "create");
    const written = await bridge.invoke<{ writeMs: number }>(
      "query-stress:mutate",
      "bulk",
      bulkSize
    );
    const committed = performance.now();
    await until(
      () => state?.result?.rows.length === bulkSize + 1 && !state?.loading,
      "批量新增未完整刷新"
    );
    const rows = state?.result?.rows;
    check(rows && new Set(rows.map(row => row.id)).size === bulkSize + 1, "批量结果身份重复");
    return {
      rows: bulkSize,
      writeMs: written.writeMs,
      commitToRefreshMs: Math.round(performance.now() - committed),
    };
  });
  await scenario(`live:bulk-leave-${outSize}`, async () => {
    await bridge.invoke("query-stress:mutate", "bulk-out", outSize);
    await until(
      () => state?.result?.rows.length === remaining + 1 && !state.loading,
      "批量移出范围不完整"
    );
  });
  await scenario("transaction:rollback", async () => {
    check(await bridge.invoke("query-stress:mutate", "rollback"), "回滚未保全记录");
    const result = await run({
      version: 1,
      language: "dsl",
      code: `TABLE count() AS n FROM cards WHERE hasTag("${info.marker}")`,
    });
    check(result.rows[0].values.n === remaining + 1, "回滚数据泄漏到查询");
  });
  const countDefinition: QueryDefinition = {
    version: 1,
    language: "dsl",
    code: `TABLE count() AS n FROM cards WHERE hasTag("${info.marker}")`,
  };
  await scenario("parallel:20-queries", async () => {
    const outputs = await Promise.all(Array.from({ length: 20 }, () => run(countDefinition)));
    check(
      outputs.every(result => result.rows[0].values.n === remaining + 1),
      "并发查询发生串数"
    );
  });
  await scenario("parallel:bounded-backlog", async () => {
    const total = QUERY_LIMITS.concurrency + QUERY_LIMITS.backlog + 1;
    const runs = Array.from({ length: total }, () =>
      startQuery({
        definition: {
          version: 1,
          language: "javascript",
          code: 'await new Promise(r=>setTimeout(r,100));return {columns:[{key:"n",title:"n",type:"number"}],rows:[{id:"one",values:{n:1}}]};',
        },
        context,
        read: async () => ({ items: [] }),
      })
    );
    const settled = Promise.allSettled(runs.map(run => run.result));
    check(
      document.querySelectorAll("iframe").length <= QUERY_LIMITS.concurrency,
      "执行环境无界增长"
    );
    const outputs = await settled;
    check(
      outputs.some(output => output.status === "rejected" && /过多/.test(String(output.reason))),
      "队列超载未受控拒绝"
    );
    check(
      outputs.every(output => output.status === "fulfilled" || /过多/.test(String(output.reason))),
      "有界队列中查询异常失败"
    );
    await run(countDefinition);
    return {
      submitted: total,
      rejected: outputs.filter(output => output.status === "rejected").length,
    };
  });
  await scenario("repeat:20-mutations-and-queries", async () => {
    for (let index = 0; index < 20; index++) {
      const included = index % 2 === 1;
      await bridge.invoke("query-stress:mutate", "tags", included);
      const output = await run(countDefinition);
      check(output.rows[0].values.n === remaining + Number(included), "修改后重算结果错误");
    }
  });
  const queryTableId = await bridge.invoke<number>("query-stress:query-table");
  await scenario("definition:32-concurrent-writers", async () => {
    const writes = await Promise.allSettled(
      Array.from({ length: 32 }, (_, index) =>
        bridge.invoke("data-table-query:update", {
          tableId: queryTableId,
          expectedRevision: 1,
          definition: { version: 1, language: "dsl", code: `TABLE title FROM cards // ${index}` },
        })
      )
    );
    check(writes.filter(write => write.status === "fulfilled").length === 1, "并发覆盖保护失效");
    const detail = await bridge.invoke<{ table: { query: { revision: number }; rows: unknown[] } }>(
      "data-table:get-detail",
      queryTableId
    );
    check(
      detail.table.query.revision === 2 && detail.table.rows.length === 0,
      "定义版本或结果持久化错误"
    );
  });
  await scenario("read-only:rejected-writes-unchanged", async () => {
    const before = await bridge.invoke<FixtureInspection>("query-stress:inspect");
    const writes = await Promise.allSettled([
      bridge.invoke("data-table:update", { id: queryTableId, rows: [{ id: "injected" }] }),
      bridge.invoke("data-table:apply-changes", {
        id: queryTableId,
        rows: { upsert: [{ id: "injected" }], inserted: ["injected"], remove: [] },
      }),
      bridge.invoke("data-table:patch-row", {
        tableId: queryTableId,
        rowId: "injected",
        patch: { value: 1 },
        expected: {},
      }),
    ]);
    check(
      writes.every(write => write.status === "rejected"),
      "查询表允许了数据写入"
    );
    const after = await bridge.invoke<FixtureInspection>("query-stress:inspect");
    check(equal(before.snapshot, after.snapshot), "拒绝写入仍修改了记录");
  });
  const errors: [string, QueryDefinition, string][] = [
    ["syntax", { version: 1, language: "dsl", code: "TABLE title cards" }, "FROM"],
    [
      "unknown-field",
      { version: 1, language: "dsl", code: "TABLE missing FROM cards" },
      "未知字段",
    ],
    [
      "script-throw",
      { version: 1, language: "javascript", code: 'throw new Error("expected failure")' },
      "expected failure",
    ],
    [
      "duplicate-id",
      {
        version: 1,
        language: "javascript",
        code: 'return {columns:[{key:"n",title:"n",type:"number"}],rows:[{id:"same",values:{n:1}},{id:"same",values:{n:2}}]};',
      },
      "唯一",
    ],
    [
      "wrong-type",
      {
        version: 1,
        language: "javascript",
        code: 'return {columns:[{key:"n",title:"n",type:"number"}],rows:[{id:"one",values:{n:"text"}}]};',
      },
      "number",
    ],
    [
      "no-write-api",
      { version: 1, language: "javascript", code: "await data.cards.create({});" },
      "function",
    ],
  ];
  for (const [name, definition, expected] of errors)
    await scenario(`failure:${name}`, async () => {
      let error: unknown;
      try {
        await run(definition);
      } catch (caught) {
        error = caught;
      }
      check(error && String(error).includes(expected), "异常没有受控返回");
    });
  for (const size of [10_000, 20_000, 20_001, 50_001])
    await scenario(`volume:${size}`, async () => {
      const tableId = await bridge.invoke<number>("query-stress:large-table", size);
      const definition: QueryDefinition = {
        version: 1,
        language: "dsl",
        code:
          size > 50_000
            ? "TABLE count() AS n FROM tables"
            : 'TABLE id, field("value") AS 数值 FROM tables',
        params: { tableId },
      };
      if (size <= 20_000) {
        const result = await run(definition);
        check(
          result.rows.length === size && new Set(result.rows.map(row => row.id)).size === size,
          "大表分页遗漏或重复"
        );
      } else {
        let error: unknown;
        try {
          await run(definition);
        } catch (caught) {
          error = caught;
        }
        check(error && /过多|LIMIT/.test(String(error)), "超限未明确失败");
      }
    });
  await scenario("volume:17MB-read-budget", async () => {
    const tableId = await bridge.invoke<number>("query-stress:large-payload");
    let error: unknown;
    try {
      await run({
        version: 1,
        language: "dsl",
        code: 'TABLE field("value") AS 长文本 FROM tables',
        params: { tableId },
      });
    } catch (caught) {
      error = caught;
    }
    check(error && /过多|过大/.test(String(error)), "字节预算未拒绝");
  });
  await scenario("lifecycle:definition-replaced", async () => {
    root.render(
      <Probe
        definition={{
          version: 1,
          language: "javascript",
          code: 'await new Promise(r=>setTimeout(r,600)); return {columns:[{key:"n",title:"n",type:"text"}],rows:[{id:"old",values:{n:"old"}}]};',
        }}
      />
    );
    await until(() => Boolean(state?.loading), "旧查询未开始");
    root.render(
      <Probe
        definition={{
          version: 1,
          language: "javascript",
          code: 'return {columns:[{key:"n",title:"n",type:"text"}],rows:[{id:"new",values:{n:"new"}}]};',
        }}
      />
    );
    await until(() => state?.result?.rows[0]?.id === "new" && !state.loading, "新查询未发布");
    await new Promise(resolve => setTimeout(resolve, 900));
    check(state?.result?.rows[0]?.id === "new", "旧结果覆盖了新代码");
  });
  await scenario("lifecycle:hidden-resume", async () => {
    root.render(<Probe definition={definition} />);
    await until(
      () => state?.result?.rows.length === remaining + 1 && !state.loading,
      "恢复来源查询失败"
    );
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await bridge.invoke("query-stress:mutate", "tags", false);
    await new Promise(resolve => setTimeout(resolve, 1000));
    check(state?.result?.rows.length === remaining + 1, "隐藏状态发布了新结果");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await until(
      () => state?.result?.rows.length === remaining && !state.loading,
      "恢复前台没有重读"
    );
  });
  await scenario("isolation:switch-and-return", async () => {
    await bridge.invoke("query-stress:create-other");
    await connect("other.db");
    await until(() => state?.result?.rows.length === 0 && !state.loading, "切库混入旧结果");
    await connect("data.db");
    await until(
      () => state?.result?.rows.length === remaining && !state.loading,
      "切回资料库未恢复"
    );
  });
  await scenario("isolation:ordinary-reconnect", async () => {
    const old = createQueryReader("data.db", undefined, new AbortController().signal);
    const before = state?.result;
    await connect("data.db", true);
    check((await old({ source: "cards" })).items.length > 0, "普通重连错误地失效了逻辑绑定");
    await until(
      () => state?.result !== before && state?.result?.rows.length === remaining && !state.loading,
      "普通重连没有重新读取"
    );
  });
  await scenario("lifecycle:failed-read-preserves-result", async () => {
    const before = state?.result;
    await bridge.invoke("query-stress:close");
    state?.refresh();
    await until(() => Boolean(state?.error) && !state?.loading, "断连未显示失败");
    check(state?.result === before, "断连丢弃了上次成功结果");
    await connect("data.db", true);
    await until(
      () => !state?.error && state?.result?.rows.length === remaining && !state.loading,
      "断连后重连未恢复"
    );
  });
  let beforeReplacement: { quickCheck: unknown; foreignKeys: number } | undefined;
  await scenario("isolation:download-replacement", async () => {
    const old = createQueryReader("data.db", undefined, new AbortController().signal);
    beforeReplacement = await bridge.invoke("query-stress:replace");
    await connect("data.db", false, "sync_download_reconnect");
    let rejected = false;
    try {
      await old({ source: "cards" });
    } catch {
      rejected = true;
    }
    check(rejected, "替换后旧绑定仍然有效");
    await until(() => state?.result?.rows.length === 0 && !state.loading, "同名替换库混入旧结果");
    const todos = await run({ version: 1, language: "dsl", code: "TABLE id FROM todos" });
    check(todos.rows.length === 0, "替换后混入旧的正文任务索引");
  });
  await scenario("failure:read-adapter-serialization", async () => {
    let failure: unknown;
    try {
      await startQuery({
        definition: { version: 1, language: "javascript", code: "await data.cards.collect();" },
        context,
        read: async () => ({ items: [{ id: "bad", value: (() => 1) as never }] }),
        timeoutMs: 2000,
      }).result;
    } catch (error) {
      failure = error;
    }
    check(failure && !String(failure).includes("超时"), "不可克隆数据未及时受控返回");
  });
  await scenario("failure:invalid-adapter-page", async () => {
    let failure: unknown;
    try {
      await startQuery({
        definition: { version: 1, language: "javascript", code: "await data.cards.collect();" },
        context,
        read: async () => ({ items: null as never }),
        timeoutMs: 2000,
      }).result;
    } catch (error) {
      failure = error;
    }
    check(failure && String(failure).includes("无效分页"), "无效分页未受控返回");
  });
  await scenario("volume:UTF8-budget", async () => {
    let failure: unknown;
    try {
      await run({
        version: 1,
        language: "javascript",
        code: 'return {columns:[{key:"text",title:"text",type:"text"}],rows:[{id:"one",values:{text:"😀".repeat(4100000)}}]};',
      });
    } catch (error) {
      failure = error;
    }
    check(failure && String(failure).includes("体积过大"), "UTF-8 字节预算没有拒绝多字节字符");
  });
  root.unmount();
  await scenario("runtime:cleanup", async () => {
    await until(() => !document.querySelector("iframe"), "执行环境未释放");
  });
  const inspect = await bridge.invoke<FixtureInspection>("query-stress:inspect");
  return {
    results,
    failed: results.filter(result => !result.ok).length + unexpected.length,
    integrityBeforeReplacement: beforeReplacement,
    integrity: inspect.quickCheck,
    foreignKeys: inspect.foreignKeys,
    unexpected,
  };
}
declare global {
  interface Window {
    verifyQueryDataStress: typeof verifyQueryDataStress;
  }
}
window.verifyQueryDataStress = verifyQueryDataStress;
