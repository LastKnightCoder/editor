import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DatabaseProps, RowDetailBodyHandle } from "@tau/database";
import type { Descendant } from "slate";

const state = vi.hoisted(() => {
  const invoke = vi.fn();
  window.electron = { platform: "darwin", invoke, on: vi.fn() } as unknown as ElectronAPI;
  return {
    invoke,
    active: "a.db",
    connection: "before",
    props: null as DatabaseProps | null,
    writes: [] as unknown[],
    rejected: 0,
  };
});
vi.mock("@/stores/useSettingStore", () => {
  const getState = () => ({ setting: { database: { active: state.active } } });
  return {
    default: Object.assign(
      (select: (value: ReturnType<typeof getState>) => unknown) => select(getState()),
      { getState }
    ),
  };
});
vi.mock("@tau/database", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/database")>()),
  default: (props: DatabaseProps) => {
    state.props = props;
    return null;
  },
}));
vi.mock("../desktopExtension", () => ({ desktopDatabaseExtension: { id: "test.desktop" } }));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("@/components/ContentEditor", () => ({
  default: (props: {
    readonly?: boolean;
    initValue?: Descendant[];
    onChange?: (value: Descendant[]) => void;
  }) => {
    if (props.readonly) return <output>{JSON.stringify(props.initValue)}</output>;
    return (
      <textarea
        onChange={event =>
          props.onChange?.([
            { type: "paragraph", children: [{ text: event.currentTarget.value }] },
          ] as Descendant[])
        }
      />
    );
  },
}));
vi.mock("@/services/editorKit", () => ({
  prepareNewContent: async (content: Descendant[]) => ({ content, contracts: {} }),
}));

import { GalleryCover } from "../GalleryCover";
import { RowDetailBody } from "../RowDetailBody";
import { DesktopDatabase } from "../DesktopDatabase";
import { isCurrentDatabaseQuery, rememberDatabaseConnection } from "@/services/command-context";

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let sequence = 0;
const row = { id: "row", title: "record" };
const held = new Set<string>();
const responses: Array<() => void> = [];
const patched = vi.fn(async () => true);
const body = createRef<RowDetailBodyHandle>();

beforeEach(() => {
  state.connection = `before-${++sequence}`;
  state.active = "a.db";
  state.writes = [];
  state.rejected = 0;
  held.clear();
  responses.length = 0;
  patched.mockClear();
  rememberDatabaseConnection({ databaseName: state.active, connectionId: state.connection });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseName?: string; toolDatabaseConnection?: string };
    if (
      scope.toolDatabaseName !== state.active ||
      scope.toolDatabaseConnection !== state.connection
    ) {
      state.rejected++;
      throw new Error("DATABASE_CONNECTION_CHANGED");
    }
    let value: unknown;
    if (channel === "content:get-by-id")
      value = {
        id: 17,
        createTime: 0,
        updateTime: 1,
        count: 1,
        refCount: 1,
        content: [{ type: "paragraph", children: [{ text: state.connection }] }],
      };
    else {
      state.writes.push({ channel, connection: state.connection, payload: args[0] });
      value = channel === "content:create-pending" ? ++sequence : true;
    }
    if (held.has(channel)) return new Promise(resolve => responses.push(() => resolve(value)));
    return value;
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
});

async function mount(children: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
  );
}
async function replace() {
  await act(async () => {
    state.connection = `after-${++sequence}`;
    rememberDatabaseConnection({ databaseName: state.active, connectionId: state.connection });
    await client.invalidateQueries({ predicate: query => isCurrentDatabaseQuery(query.queryKey) });
  });
}
async function waitForCover() {
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.querySelector("output")?.textContent).toContain(state.connection)
    );
  });
}
function input(text: string) {
  const textarea = host.querySelector("textarea");
  if (!textarea) throw new Error("正文输入未挂载");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      textarea,
      text
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function detail() {
  return (
    <RowDetailBody
      ref={body}
      row={row}
      readonly={false}
      onRowChange={patched}
      isRowPresent={() => true}
    />
  );
}
function table(onDataChange?: DatabaseProps["onDataChange"]) {
  return (
    <DesktopDatabase
      tableId={9}
      columns={[]}
      data={[row]}
      views={[]}
      activeViewId={1}
      onDataChange={onDataChange}
      viewConfig={{ columnOrder: [], rowOrder: [], sorts: [], filters: null }}
    />
  );
}
function tableProps() {
  if (!state.props) throw new Error("数据库实例尚未挂载");
  return state.props;
}
async function flush() {
  await act(async () => {
    await body.current?.flush();
  });
}

it("同名资料库覆盖后，保留的图库封面读取新正文", async () => {
  await mount(
    <GalleryCover row={{ ...row, detailContentId: 17 }} columns={[]} coverType="detail" />
  );
  await waitForCover();
  await replace();
  await waitForCover();
  expect(state.rejected).toBe(0);
});

it("图库封面的旧读取迟到时不覆盖新连接的正文", async () => {
  held.add("content:get-by-id");
  await mount(
    <GalleryCover row={{ ...row, detailContentId: 17 }} columns={[]} coverType="detail" />
  );
  await vi.waitFor(() => expect(responses).toHaveLength(1));
  held.clear();
  await replace();
  await waitForCover();
  await act(async () => responses.splice(0).forEach(resolve => resolve()));
  await waitForCover();
});

it("覆盖后输入的新行详情能够保存，覆盖前草稿不会写进新库", async () => {
  await mount(detail());
  input("old draft");
  await replace();
  await flush();
  expect(state.writes).toEqual([]);
  input("new draft");
  await flush();
  expect(state.writes).toMatchObject([
    {
      channel: "content:create-pending",
      connection: state.connection,
      payload: { content: [{ children: [{ text: "new draft" }] }] },
    },
  ]);
  expect(patched).toHaveBeenCalledOnce();
});

it("行详情创建的旧响应不能挂到新库的同编号行", async () => {
  await mount(detail());
  held.add("content:create-pending");
  input("old in flight");
  const pending = body.current?.flush();
  await vi.waitFor(() => expect(responses).toHaveLength(1));
  await replace();
  await act(async () => {
    responses.splice(0).forEach(resolve => resolve());
    await pending;
  });
  expect(patched).not.toHaveBeenCalled();
  held.clear();
  input("current");
  await flush();
  expect(patched).toHaveBeenCalledOnce();
});

it("旧行详情创建尚未返回时的新输入等待后仍会保存", async () => {
  await mount(detail());
  held.add("content:create-pending");
  input("old in flight");
  const previous = body.current?.flush();
  await vi.waitFor(() => expect(responses).toHaveLength(1));
  await replace();
  held.clear();
  input("new while waiting");
  const current = body.current?.flush();
  await act(async () => {
    responses.splice(0).forEach(resolve => resolve());
    await Promise.all([previous, current]);
  });
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toMatchObject({
    connection: state.connection,
    payload: { content: [{ children: [{ text: "new while waiting" }] }] },
  });
  expect(patched).toHaveBeenCalledOnce();
});

it("数据库行补丁在覆盖后重新绑定，旧实例的回调不能写新库", async () => {
  await mount(table());
  const previous = tableProps();
  await replace();
  await expect(
    tableProps().onDetachedRowPatch?.("row", { detailContentId: 17 }, row)
  ).resolves.toBe(true);
  expect(await previous.onDetachedRowPatch?.("row", { detailContentId: 18 }, row)).toBe(false);
  expect(state.writes).toHaveLength(1);
});

it("覆盖前保留的数据回调不会转发到新实例的保存入口", async () => {
  const save = vi.fn();
  await mount(table(save));
  const previous = tableProps();
  await replace();
  const change = {
    source: "user" as const,
    rows: { upsert: [row], remove: [] },
    dataChanged: true,
    viewChanged: false,
  };
  await previous.onDataChange?.({ columns: [], rows: [row] }, change);
  expect(save).not.toHaveBeenCalled();
  await tableProps().onDataChange?.({ columns: [], rows: [row] }, change);
  expect(save).toHaveBeenCalledOnce();
});

it.skipIf(process.env.TAU_DATABASE_RECONNECT_STRESS !== "1")(
  "保留图库和数据库详情连续覆盖后只读写当前库",
  async () => {
    const rounds = 200;
    await mount(
      <>
        <GalleryCover row={{ ...row, detailContentId: 17 }} columns={[]} coverType="detail" />
        {detail()}
        {table()}
      </>
    );
    await waitForCover();
    for (let iteration = 0; iteration < rounds; iteration++) {
      const previous = tableProps();
      input(`discard-${iteration}`);
      await replace();
      await waitForCover();
      await flush();
      input(`current-${iteration}`);
      await flush();
      await tableProps().onDetachedRowPatch?.("row", { detailContentId: iteration + 1 }, row);
      expect(await previous.onDetachedRowPatch?.("row", { detailContentId: -1 }, row)).toBe(false);
    }
    expect(state.writes).toHaveLength(rounds * 2);
    expect(patched).toHaveBeenCalledTimes(rounds);
    expect(state.rejected).toBe(0);
    console.info(
      `[retained database stress] replacements=${rounds}, currentWrites=${state.writes.length}, staleCallbacksBlocked=${rounds}`
    );
  },
  120_000
);
