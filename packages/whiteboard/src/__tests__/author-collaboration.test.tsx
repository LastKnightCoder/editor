import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import { WhiteboardModel, collectWhiteboardDocumentResources } from "@tau/collaboration";
import {
  defineElement,
  defineWhiteboardExtension,
  useWhiteboardAPI,
  type WhiteboardAPI,
  type WhiteboardElementDefinition,
} from "../author";
import { hostWhiteboardExtensions } from "../extensions/authorApi";
import { WhiteboardContractCatalog } from "../collaboration/catalog";
import { createWhiteboardBinding } from "../collaboration/binding";
import { createServiceRegistry } from "@tau/shared/service-registry";
import { IWhiteboardAuthorPermission } from "../extensions/authorAccess";
import Board from "../Board";
const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);
const geometry = { x: 0, y: 0, width: 40, height: 20, rotation: 0 };
const v1 = () =>
  defineElement({
    type: "example.board.shape",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
    resources: [{ path: "cover", kind: "image" }],
    render: () => <g data-version="one" />,
  });
async function fixture(
  definition: WhiteboardElementDefinition = v1(),
  state?: Uint8Array,
  install = true,
  onCreate?: (api: WhiteboardAPI) => void
) {
  let api!: WhiteboardAPI,
    enabled = true;
  const extension = defineWhiteboardExtension({
    id: "example.board",
    elements: [definition],
    create(value) {
      api = value;
      onCreate?.(api);
      return {};
    },
  });
  const extensions = hostWhiteboardExtensions(install ? [extension] : [], "example.board");
  const catalog = await WhiteboardContractCatalog.prepare(
    extensions.map(extension => ({ owner: "example.board", elements: extension.elements ?? [] }))
  );
  const doc = new Y.Doc({ gc: false });
  if (state) Y.applyUpdate(doc, state);
  const model = new WhiteboardModel(doc);
  const page =
    model.read().pages[0]?.id ??
    model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const binding = createWhiteboardBinding(model, {
    pageId: page,
    types: {},
    catalog,
    canEditContract: () => enabled,
  });
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.attachDocument(binding);
  board.installExtensions(
    extensions,
    undefined,
    createServiceRegistry(register =>
      register(IWhiteboardAuthorPermission, {
        assertActive: () => {
          if (!enabled) throw new Error("插件失活");
        },
      })
    )
  );
  cleanup.push(() => {
    board.destroy();
    model.dispose();
    doc.destroy();
  });
  const create = (data: Record<string, any> = {}) =>
    api.submit([
      {
        type: "create",
        element: { type: definition.type, data, geometry },
        parent: { kind: "page", id: page },
      },
    ]).createdIds[0];
  return {
    doc,
    model,
    board,
    binding,
    catalog,
    api,
    page,
    create,
    disable: () => {
      enabled = false;
    },
  };
}
it("正式作者 API 不暴露路径/模型，首次创建把契约和节点原子写入并保留创建撤销", async () => {
  const f = await fixture();
  expect(f.model.contracts.size).toBe(0);
  expect(f.api).not.toHaveProperty("apply");
  expect(f.api).not.toHaveProperty("doc");
  expect(Object.keys(f.api.getSnapshot()).sort()).toEqual(["children", "pageId"]);
  expect(f.api.children).toBe(f.api.getSnapshot().children);
  expect(Object.getPrototypeOf(f.api)).toBe(Object.prototype);
  const updates: Uint8Array[] = [];
  f.doc.on("update", update => updates.push(update));
  const id = f.create({ source: "开始", unknown: { keep: true } });
  expect(updates).toHaveLength(1);
  expect(f.binding.history.undoStack).toHaveLength(1);
  expect(f.api.getElement(id)).not.toHaveProperty("contractId");
  expect(f.api.getElement(id)).not.toHaveProperty("fieldBindings");
  f.binding.undo();
  expect(f.model.read().pages[0].children).toHaveLength(0);
  expect(f.model.elements.has(id)).toBe(true);
  expect(f.model.contracts.size).toBe(1);
  f.binding.redo();
  expect(f.api.getElement(id)?.data.unknown).toEqual({ keep: true });
});
it("整批无效时契约、节点和历史均零写入", async () => {
  const f = await fixture(),
    before = Y.encodeStateAsUpdate(f.doc);
  expect(() =>
    f.api.submit([
      {
        type: "create",
        element: { type: "example.board.shape", data: {}, geometry },
        parent: { kind: "page", id: f.page },
      },
      { type: "set_data", id: "missing", patch: {} },
    ])
  ).toThrow();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
  expect(f.model.contracts.size).toBe(0);
  expect(f.binding.history.undoStack).toHaveLength(0);
  expect(() =>
    f.api.submit([
      {
        type: "create",
        element: { type: "example.board.shape", data: {}, geometry },
        parent: { kind: "page", id: f.page },
        beforeId: "a",
        afterId: "b",
      },
    ] as any)
  ).toThrow();
});
it("普通补丁保留未知字段，文本只能经公共句柄，历史与壳层统一", async () => {
  const f = await fixture(),
    id = f.create({ unknown: { keep: true }, old: "remove" });
  f.api.updateElementData(id, { title: "标题" }, { unset: ["old"] });
  expect(f.api.getElement(id)?.data.unknown).toEqual({ keep: true });
  expect(f.api.getElement(id)?.data).not.toHaveProperty("old");
  expect(() => f.api.updateElementData(id, { source: "覆盖" })).toThrow();
  expect(() => f.api.updateElement(id, { data: {} } as any)).toThrow();
  const handle = f.api.getTextBinding(id, "source");
  handle.edit({ offset: 0, remove: 0, text: "输入", revision: handle.getSnapshot().revision });
  f.api.updateElement(id, { geometry: { ...geometry, x: 50 } });
  handle.undo();
  expect(f.api.getElement(id)?.geometry.x).toBe(0);
  expect(handle.getSnapshot().value).toBe("输入");
  handle.undo();
  expect(handle.getSnapshot().value).toBe("");
  expect(() => handle.edit({ offset: 0, remove: 0, text: "旧观察", revision: "old" })).toThrow();
});
it.each(["read", "edit", "none"] as const)(
  "历史精确契约 %s 不会加载迁移或误用最新版渲染",
  async access => {
    const old = v1(),
      first = await fixture(old),
      id = first.create({ source: "旧数据", unknown: 1 });
    const migrate = vi.fn(data => ({ ...data })),
      latest = defineElement({
        ...old,
        dataVersion: 2,
        render: () => <g data-version="two" />,
        previousVersions: [{ element: old, access }],
        migrations: [{ from: 1, migrate }],
      });
    const f = await fixture(latest, Y.encodeStateAsUpdate(first.doc)),
      initial = Y.encodeStateAsUpdate(f.doc);
    const output = renderToStaticMarkup(<svg>{f.board.renderElement(f.board.children[0])}</svg>);
    expect(output.includes('data-version="one"')).toBe(access !== "none");
    expect(output).not.toContain('data-version="two"');
    expect(migrate).not.toHaveBeenCalled();
    if (access === "edit") f.api.updateElementData(id, { title: "可编辑" });
    else {
      expect(() => f.api.updateElementData(id, { title: "禁止" })).toThrow();
      if (access === "none") expect(() => f.api.getTextBinding(id, "source")).toThrow();
      if (access === "read") {
        const reader = f.api.getTextBinding(id, "source");
        expect(reader.getSnapshot().value).toBe("旧数据");
        expect(() => reader.replace("覆盖", reader.getSnapshot().revision)).toThrow();
      }
      expect(Y.encodeStateAsUpdate(f.doc)).toEqual(initial);
    }
    f.api.updateElement(id, { geometry: { ...geometry, x: 20 } });
    expect(f.api.getElement(id)?.geometry.x).toBe(20);
  }
);
it("同类型同版本但不同文本/资源契约必须占位，不能按版本号猜测", async () => {
  const original = await fixture(),
    id = original.create({ source: "保留" });
  const definition = defineElement({ ...v1(), collaboration: { textFields: ["code"] } });
  const f = await fixture(definition, Y.encodeStateAsUpdate(original.doc));
  expect(f.board.extensions?.unknownElementReason(f.board.children[0])).toBeDefined();
  expect(() => f.api.updateElementData(id, { title: "不能改" })).toThrow();
  expect(f.api.getElement(id)?.data.source).toBe("保留");
});
it("缺失插件仍保留原契约、文字、资源及载荷，允许宿主整体复制/移动/删除撤销", async () => {
  const first = await fixture(),
    id = first.create({ source: "文字", cover: "tau-collab-asset:cover", unknown: [1, 2] });
  const f = await fixture(v1(), Y.encodeStateAsUpdate(first.doc), false),
    before = f.model.read();
  expect(f.board.extensions?.unknownElementReason(f.board.children[0])?.reason).toBe("missing");
  expect(f.model.read()).toEqual(before);
  expect(collectWhiteboardDocumentResources(f.doc)).toEqual(["tau-collab-asset:cover"]);
  const clone = { ...structuredClone(f.board.children[0]), id: "clone" };
  f.board.apply({ type: "insert_node", path: [1], node: clone });
  expect(f.model.read().pages[0].children[1].data).toEqual(before.pages[0].children[0].data);
  expect(f.model.text(id, "source")).not.toBe(f.model.text("clone", "source"));
  f.board.apply({ type: "set_node", path: [0], properties: { x: 0 }, newProperties: { x: 30 } });
  f.board.apply({ type: "remove_node", path: [0], node: f.board.children[0] });
  f.binding.undo();
  expect(f.model.read().pages[0].children[0].data.source).toBe("文字");
});
it("只读、插件失活和作用域销毁均阻止迟到写入与文本句柄", async () => {
  const f = await fixture(),
    id = f.create(),
    handle = f.api.getTextBinding(id, "source"),
    valid = f.api.captureSubmission(id);
  f.disable();
  expect(valid()).toBe(false);
  expect(() => f.api.updateElementData(id, { x: 1 })).toThrow("失活");
  expect(() => handle.replace("迟到", handle.getSnapshot().revision)).toThrow();
  f.board.destroy();
  expect(() => f.api.submit([{ type: "remove_nodes", ids: [id] }])).toThrow();
});
it("远端投影的订阅回调不能触发作者回写", async () => {
  const f = await fixture(),
    id = f.create(),
    other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(f.doc));
  const peer = new WhiteboardModel(other),
    rejected = vi.fn();
  f.api.subscribe(() => {
    try {
      f.api.updateElementData(id, { echo: true });
    } catch {
      rejected();
    }
  });
  peer.submit([{ type: "set_data", id, patch: { remote: true } }], {});
  await f.model.receive(Y.encodeStateAsUpdate(other));
  expect(rejected).toHaveBeenCalled();
  expect(f.api.getElement(id)?.data).not.toHaveProperty("echo");
  peer.dispose();
  other.destroy();
});
it("目录拒绝重复历史版本与资源/文本重叠，显式迁移仅转换业务载荷", async () => {
  const old = v1();
  expect(() =>
    defineElement({ ...old, previousVersions: [{ element: old, access: "read" }] })
  ).toThrow();
  expect(() => defineElement({ ...old, resources: [{ path: "source", kind: "file" }] })).toThrow();
  expect(() => defineElement({ ...old, schemaVersion: 1 } as any)).toThrow();
  const f = await fixture(
    defineElement({
      ...old,
      dataVersion: 2,
      previousVersions: [{ element: old, access: "edit" }],
      migrations: [{ from: 1, migrate: data => ({ ...data, new: true }) }],
    })
  );
  const entry = Object.entries(f.catalog.dictionary).find(
    ([, contract]) => contract.dataVersion === 1
  )!;
  expect(f.catalog.migrate(entry[0], { source: "旧", unknown: 123 }).data).toEqual({
    source: "旧",
    unknown: 123,
    new: true,
  });
});

it("只读版本可通过同一文本句柄渲染，组件上下文明确只读", async () => {
  const old = defineElement({
    ...v1(),
    render: function ReadonlySource({ element }) {
      const api = useWhiteboardAPI(),
        field = api.getTextBinding(element.id, "source");
      return <g data-readonly={String(api.readonly)} data-value={field.getSnapshot().value} />;
    },
  });
  const first = await fixture(old),
    id = first.create({ source: "可读" });
  const f = await fixture(
    defineElement({ ...old, dataVersion: 2, previousVersions: [{ element: old, access: "read" }] }),
    Y.encodeStateAsUpdate(first.doc)
  );
  const output = renderToStaticMarkup(<svg>{f.board.renderElement(f.board.children[0])}</svg>);
  expect(output).toContain('data-readonly="true"');
  expect(output).toContain('data-value="可读"');
  const reader = f.api.getTextBinding(id, "source");
  expect(() =>
    reader.edit({ offset: 0, remove: 0, text: "禁止", revision: reader.getSnapshot().revision })
  ).toThrow();
});
it("插件不能改其他归属的内部字段或冒用命令/事件作用域", async () => {
  const f = await fixture();
  const { prepareWhiteboardContract } = await import("@tau/db-schema/content-contracts");
  const foreign = await prepareWhiteboardContract("example.other", {
    type: "example.other.shape",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
  });
  await f.model.installContracts({ [foreign.id]: foreign.contract });
  const id = f.model.submit(
    [
      {
        type: "create",
        contractId: foreign.id,
        data: { secret: "keep" },
        geometry,
        parent: { kind: "page", id: f.page },
      },
    ],
    null
  ).createdIds[0];
  expect(() => f.api.updateElementData(id, { secret: "overwritten" })).toThrow();
  expect(() => f.api.getTextBinding(id, "source")).toThrow();
  expect(() => f.api.emit("example.other.changed")).toThrow();
  await expect(f.api.execute("example.other.write")).rejects.toThrow();
  f.api.updateElement(id, { geometry: { ...geometry, x: 10 } });
  expect(f.api.getElement(id)?.data.secret).toBe("keep");
});
it("只读文档与宿主权限失效时，不接受文本写入和异步条件提案", async () => {
  const f = await fixture(),
    id = f.create(),
    field = f.api.getTextBinding(id, "source");
  f.board.readonly = true;
  expect(f.api.readonly).toBe(true);
  expect(() => f.api.updateElementData(id, { title: "no" })).toThrow();
  expect(() => field.replace("no", field.getSnapshot().revision)).toThrow();
  f.board.readonly = false;
  f.disable();
  expect(() =>
    f.binding.beginConditional("late", [
      { type: "edit_text", id, field: "source", edit: { offset: 0, remove: 0, text: "迟到" } },
    ])
  ).toThrow();
  expect(f.model.text(id, "source").toString()).toBe("");
});
it("异步条件结果使用同一插件文本根和历史，普通 replace 不冒充远端条件提交", async () => {
  const f = await fixture(),
    id = f.create(),
    field = f.api.getTextBinding(id, "source"),
    observed = field.getSnapshot();
  field.edit({ offset: 0, remove: 0, text: "本机", revision: observed.revision });
  expect(() => field.replace("迟到计算", observed.revision)).toThrow();
  const update = f.binding.beginConditional("result", [
    { type: "edit_text", id, field: "source", edit: { offset: 0, remove: 2, text: "条件结果" } },
  ]);
  expect(f.api.readonly).toBe(true);
  expect(() => f.api.updateElementData(id, { title: "等待中" })).toThrow();
  await f.binding.receiveDocument(update);
  const updateHash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(update))),
  ]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
  const receipt: import("@tau/collaboration").DocumentOperation = {
    documentId: "doc",
    operationId: "result",
    actorId: "author",
    state: "COMMITTED",
    epoch: 0,
    version: 3,
    baselineId: "base",
    expiresAt: Date.now() + 1000,
    updateHash,
    receipt: {
      documentId: "doc",
      epoch: 0,
      baselineId: "base",
      sequence: 1,
      revision: "a".repeat(64),
    },
  };
  await f.binding.finishConditional(receipt);
  await f.binding.finishConditional(receipt);
  expect(field.getSnapshot().value).toBe("条件结果");
  expect(f.binding.history.undoStack).toHaveLength(3);
  field.undo();
  expect(field.getSnapshot().value).toBe("本机");
});
it("schema 只校验本机受控候选，不会改写远端载荷；校验期间不能重入写入", async () => {
  let reenter = false;
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate(data: unknown) {
        if (reenter)
          expect(() =>
            f.api.updateElementData(f.board.children[0].id, { escaped: true })
          ).toThrow();
        return (data as Record<string, unknown>).invalid
          ? { issues: [{ message: "invalid" }] }
          : { value: data };
      },
    },
  };
  const f: Awaited<ReturnType<typeof fixture>> = await fixture(defineElement({ ...v1(), schema }));
  const id = f.create({ unknown: 1 });
  reenter = true;
  f.api.updateElementData(id, { label: "valid" });
  const before = Y.encodeStateAsUpdate(f.doc);
  expect(() => f.api.updateElementData(id, { invalid: true })).toThrow();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
  const remote = new Y.Doc();
  Y.applyUpdate(remote, before);
  const model = new WhiteboardModel(remote);
  model.submit([{ type: "set_data", id, patch: { invalid: true, unknown: 2 } }], {});
  await f.model.receive(Y.encodeStateAsUpdate(remote));
  expect(f.api.getElement(id)?.data.invalid).toBe(true);
  expect(f.api.getElement(id)?.data.unknown).toBe(2);
  expect(f.api.getElement(id)?.data).not.toHaveProperty("escaped");
  model.dispose();
  remote.destroy();
});

it("加载工厂只能登记贡献，不能借初始化自动转换或改写文档", async () => {
  const f = await fixture(v1(), undefined, true, api => {
    const page = api.getSnapshot().pageId;
    expect(() =>
      api.submit([
        {
          type: "create",
          element: { type: "example.board.shape", data: {}, geometry },
          parent: { kind: "page", id: page },
        },
      ])
    ).toThrow("尚未就绪");
  });
  expect(f.model.contracts.size).toBe(0);
  expect(f.model.elements.size).toBe(0);
  expect(f.binding.history.undoStack).toHaveLength(0);
  f.create();
  expect(f.model.elements.size).toBe(1);
});

it("嵌套插件 ID 不共享写权限、命令或事件归属", async () => {
  let api!: WhiteboardAPI;
  const run = vi.fn();
  const a = defineWhiteboardExtension({
    id: "example.board",
    elements: [v1()],
    create(value) {
      api = value;
      return {};
    },
  });
  const b = defineWhiteboardExtension({
    id: "example.board.child",
    elements: [
      defineElement({ type: "example.board.child.shape", dataVersion: 1, render: () => null }),
    ],
    create: () => ({ commands: [{ id: "example.board.child.run", execute: run }] }),
  });
  const left = hostWhiteboardExtensions([a], "example.board"),
    right = hostWhiteboardExtensions([b], "example.board.child");
  const catalog = await WhiteboardContractCatalog.prepare([
    { owner: "example.board", elements: left[0].elements ?? [] },
    { owner: "example.board.child", elements: right[0].elements ?? [] },
  ]);
  const doc = new Y.Doc(),
    model = new WhiteboardModel(doc),
    page = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 500, height: 500, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.attachDocument(createWhiteboardBinding(model, { pageId: page, types: {}, catalog }));
  board.installExtensions([...left, ...right]);
  cleanup.push(() => {
    board.destroy();
    model.dispose();
    doc.destroy();
  });
  expect(catalog.owns("example.board.child", catalog.current(v1().type)!)).toBe(false);
  const ownEvent = vi.fn(),
    childEvent = vi.fn();
  api.on("example.board.updated", ownEvent);
  api.on("example.board.child.updated", childEvent);
  api.emit("example.board.updated", "本插件");
  expect(ownEvent).toHaveBeenCalledWith("本插件");
  expect(() => api.emit("example.board.child.updated", "冒用")).toThrow("不属于");
  expect(childEvent).not.toHaveBeenCalled();
  await expect(api.execute("example.board.child.run")).rejects.toThrow("不属于");
  expect(run).not.toHaveBeenCalled();
  await board.extensions!.execute("example.board.child.run");
  expect(run).toHaveBeenCalledOnce();
});
it("显式迁移拒绝异步结果、不安全属性和无效历史文本，输入保持原样", async () => {
  const old = v1(),
    source = { source: "旧", nested: { keep: true } };
  for (const migrate of [
    async () => source,
    () => JSON.parse('{"source":"旧","__proto__":{}}'),
    (data: any) => {
      data.nested.keep = false;
      return data;
    },
  ] as any[]) {
    const f = await fixture(
      defineElement({
        ...old,
        dataVersion: 2,
        previousVersions: [{ element: old, access: "read" }],
        migrations: [{ from: 1, migrate }],
      })
    );
    const id = Object.entries(f.catalog.dictionary).find(
      ([, value]) => value.dataVersion === 1
    )![0];
    expect(() => f.catalog.migrate(id, source)).toThrow();
    expect(source).toEqual({ source: "旧", nested: { keep: true } });
    expect(() => f.catalog.migrate(id, { source: 42 })).toThrow("文本字段");
    expect(f.model.contracts.size).toBe(0);
  }
});

it("创建 build 收到本扩展作用域 API，不能夹带路径操作或冒用类型", async () => {
  let api!: WhiteboardAPI,
    invalid = false;
  const definition = defineElement({
    ...v1(),
    create: {
      gesture: "click",
      defaultSize: [40, 20],
      build(context) {
        api = context.api;
        return invalid
          ? ({
              element: { id: "bad", type: "example.board.shape", data: {}, ...geometry },
              operations: [{ type: "remove_node", path: [0] }],
            } as any)
          : { id: "created", type: "example.board.shape", data: {}, ...geometry };
      },
    },
  });
  const f = await fixture(definition),
    create = f.board.extensions!.getElementDefinition(definition.type)!.create!;
  const context = {
    api: f.board.extensions!.api,
    rect: geometry,
    start: { x: 0, y: 0 },
    end: { x: 40, y: 20 },
    click: true,
    shift: false,
    alt: false,
    options: null,
  };
  const node = await create.build!(context);
  expect(api).toBe(f.api);
  expect(api).not.toHaveProperty("apply");
  f.board.apply({ type: "insert_node", path: [0], node: node as any });
  expect(f.api.getElement("created")?.data.source).toBe("");
  invalid = true;
  expect(() => create.build!(context)).toThrow("路径操作");
  expect(f.model.elements.size).toBe(1);
});
it("自定义创建的 begin/move/end 都使用受控 API，预览不能执行其他类型代码", async () => {
  const seen: WhiteboardAPI[] = [],
    preview = vi.fn();
  const definition = defineElement({
    ...v1(),
    create: {
      gesture: {
        begin(context) {
          seen.push(context.api);
          expect(() =>
            context.preview({ id: "bad", type: "other.shape", data: {}, ...geometry })
          ).toThrow();
          return {
            move(value) {
              seen.push(value.api);
            },
            end(value) {
              seen.push(value.api);
              return { id: "custom", type: "example.board.shape", data: {}, ...geometry };
            },
          };
        },
      },
    },
  });
  const f = await fixture(definition),
    gesture = f.board.extensions!.getElementDefinition(definition.type)!.create!.gesture;
  if (typeof gesture === "string") throw new Error("预期自定义手势");
  const context = {
    api: f.board.extensions!.api,
    point: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    shift: false,
    alt: false,
    zoom: 1,
    pressure: 1,
  };
  const session = gesture.begin({ ...context, preview })!;
  session.move(context);
  await session.end({ ...context, moved: true });
  expect(seen).toEqual([f.api, f.api, f.api]);
  expect(preview).not.toHaveBeenCalled();
});
it.each(["disable", "page"])("异步创建期间作用域改变（%s），迟到结果不被接纳", async reason => {
  let resolve!: (value: any) => void;
  const definition = defineElement({
    ...v1(),
    create: {
      gesture: "click",
      defaultSize: [40, 20],
      build: () =>
        new Promise<any>(done => {
          resolve = done;
        }),
    },
  });
  const f = await fixture(definition),
    build = f.board.extensions!.getElementDefinition(definition.type)!.create!.build!;
  const pending = build({
    api: f.board.extensions!.api,
    rect: geometry,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    click: true,
    shift: false,
    alt: false,
    options: null,
  });
  if (reason === "disable") f.disable();
  else {
    const page = f.model.submit([{ type: "create_page", title: "另一页" }], null).createdIds[0];
    f.binding.switchPage(page);
  }
  resolve({ id: "late", type: definition.type, data: {}, ...geometry });
  expect(await pending).toBeNull();
  expect(f.model.elements.size).toBe(0);
});
