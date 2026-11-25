import { Activity, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms, type Descendant } from "slate";
import * as Y from "yjs";
import { base64ToBytes, bytesToBase64, NodeTree } from "@tau/collaboration";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor, createEditorKit } from "@tau/editor";
import { IResourceService } from "@tau/shared/host-services";
import type { NodeTreeEditor } from "@tau/editor-collab";
import { ElementContractCatalog } from "../../../../../packages/plugins/src/editor-contracts";
import { PageHost, RouterProvider, definePage, getNavigator } from "../../router";
import { clearPageDefinitionsForTest } from "../../router/registry";
import { clearPageMetasForTest } from "../../router/core/pageMeta";
import { PageResourceScope } from "../../router/PageResourceScope";
import type { ContentDetailResponse } from "../../types";
import type { CachedContentSession } from "../../services/tauri";
import useLocalContentDocument, { type LocalContentDocument } from "../useLocalContentDocument";

const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), prepare: vi.fn() }));
vi.mock("../../services/tauri", () => ({
  collabReadCache: io.read,
  collabWriteCache: io.write,
  collabDiscardCache: vi.fn(),
  collabInputDraft: vi.fn(),
  collabNodeViews: async () => ({}),
}));
vi.mock("../../app/plugins/content", () => ({
  mobileContentPlugins: {
    subscribe: () => () => {},
    getRevision: () => 0,
    prepareEditorContracts: io.prepare,
  },
}));
vi.mock("../../services/editorKit", () => ({ getMobileContentKit: vi.fn() }));
vi.mock("../../components/toast", () => ({ toast: { error: vi.fn() } }));

const kit = createEditorKit({
  services: [
    register =>
      register(IResourceService, {
        upload: async file => file.name,
        remoteResourceToLocal: async url => url,
      }),
  ],
});
let root: Root;
let host: HTMLDivElement;
let metadata: ContentDetailResponse;
let document: LocalContentDocument | undefined;
let editor: NodeTreeEditor | undefined;
let live = true;
const failures: unknown[] = [];
const createTestRoot = () =>
  createRoot(host, {
    onCaughtError: error => failures.push(error),
    onUncaughtError: error => failures.push(error),
  });

function Body() {
  document = useLocalContentDocument({
    contentId: metadata.contentId,
    content: metadata.content,
    metadata,
    version: 1,
    kit,
    guard: () => {
      if (!live) throw new Error("编辑视图已失效");
    },
    onChange: () => {},
  });
  return document ? (
    <Editor
      kit={kit}
      document={document}
      readonly={false}
      onInit={value => {
        editor = value as NodeTreeEditor;
      }}
    />
  ) : null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  failures.length = 0;
  document = undefined;
  editor = undefined;
  live = true;
  io.read.mockResolvedValue(null);
  io.write.mockResolvedValue("saved");
  const catalog = await ElementContractCatalog.prepare(
    kit.extensions.map(extension => ({ owner: extension.id, elements: extension.elements ?? [] }))
  );
  io.prepare.mockResolvedValue(catalog);
  const paragraph = catalog.current("paragraph");
  if (!paragraph) throw new Error("缺少段落契约");
  const content: Descendant[] = [
    {
      type: "paragraph",
      collabId: "p",
      tauContract: paragraph.id,
      children: [{ type: "formatted", text: "原文" }],
    } as Descendant,
  ];
  metadata = {
    contentId: 7,
    createTime: 1,
    updateTime: 1,
    content,
    count: 2,
    card: null,
    librarySourceId: "library",
    documentId: "body",
    revision: "revision",
    contracts: catalog.dictionary,
  };
  clearPageDefinitionsForTest();
  clearPageMetasForTest();
  window.history.replaceState(null, "");
  for (const key of ["home", "aiChat", "settingsModule", "aiProvider"])
    definePage({
      key,
      params: {},
      transition: { preset: "none", enterMs: 0, exitMs: 0 },
      component: key === "home" ? Body : () => <div>{key}</div>,
    });
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createTestRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function mount(showBody = true) {
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <RouterProvider rootKey="home">
          <PageHost rootContent={showBody ? <Body /> : <div />} />
        </RouterProvider>
      </DndProvider>
    )
  );
  if (showBody) await vi.waitFor(() => expect(editor?.nodeTree).toBeDefined());
}
async function push(key: string) {
  await act(async () => getNavigator().push(key));
}
async function back(key: string) {
  await act(async () => {
    const changed = new Promise<void>(resolve =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    );
    await getNavigator().goBack("ui");
    await changed;
  });
  expect(failures).toEqual([]);
  expect(getNavigator().getActiveScreen()?.key).toBe(key);
}

// iPad 从对话进入模型设置后返回，底层正文恢复时曾重新连接已释放的绑定。
it("从模型配置连续返回对话时保留正文、撤销历史，并在页面退出后释放", async () => {
  await mount();
  const initial = editor!;
  await act(async () => {
    Transforms.insertText(initial, "草稿", { at: { path: [0, 0], offset: 2 } });
    await document!.flush();
  });
  await push("aiChat");
  for (let round = 0; round < 3; round++) {
    await push("settingsModule");
    await push("aiProvider");
    await back("settingsModule");
    await back("aiChat");
    expect(failures).toEqual([]);
    expect(editor).toBe(initial);
    expect(Node.string(initial)).toBe("原文草稿");
  }
  await back("home");
  await act(async () => initial.undo());
  expect(Node.string(initial)).toBe("原文");
  await act(async () => initial.redo());
  expect(Node.string(initial)).toBe("原文草稿");
  await act(async () => root.unmount());
  expect(initial.nodeTree.doc.isDestroyed).toBe(true);
});

it("加载正文时退出页面，迟到的缓存读取不会再写缓存或挂回编辑器", async () => {
  let complete!: (value: null) => void;
  io.read.mockImplementationOnce(
    () =>
      new Promise<null>(resolve => {
        complete = resolve;
      })
  );
  await mount(false);
  definePage({
    key: "loadingBody",
    params: {},
    component: Body,
    transition: { preset: "none", enterMs: 0, exitMs: 0 },
  });
  await push("loadingBody");
  await vi.waitFor(() => expect(io.read).toHaveBeenCalled());
  await back("home");
  await vi.waitFor(() => expect(host.querySelector('[data-page-key="loadingBody"]')).toBeNull());
  await act(async () => complete(null));
  expect(io.write).not.toHaveBeenCalled();
  expect(failures).toEqual([]);
});

it("页面缓存淘汰后释放正文会话，返回时重建的编辑器仍可写入", async () => {
  await mount(false);
  definePage({
    key: "cachedBody",
    params: {},
    component: Body,
    transition: { preset: "none", enterMs: 0, exitMs: 0 },
  });
  await push("cachedBody");
  await vi.waitFor(() => expect(editor?.nodeTree).toBeDefined());
  const previous = editor!;
  for (let i = 0; i < 11; i++) {
    const key = `level${i}`;
    definePage({
      key,
      params: {},
      component: () => null,
      transition: { preset: "none", enterMs: 0, exitMs: 0 },
    });
    await push(key);
  }
  expect(previous.nodeTree.doc.isDestroyed).toBe(true);
  await act(async () => {
    const changed = new Promise<void>(resolve =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    );
    getNavigator().popTo("cachedBody");
    await changed;
  });
  expect(failures).toEqual([]);
  await vi.waitFor(() => expect(editor?.nodeTree.doc).not.toBe(previous.nodeTree.doc));
  await act(async () =>
    Transforms.insertText(editor!, "新输入", { at: { path: [0, 0], offset: 2 } })
  );
  expect(Node.string(editor!)).toBe("原文新输入");
});

it("关闭时保存失败保留输入，再次打开先保存旧会话后恢复全部内容", async () => {
  let online = true;
  let cached: CachedContentSession | undefined;
  const durable = new Y.Doc();
  io.read.mockImplementation(async () =>
    cached
      ? {
          metadata: cached,
          state: bytesToBase64(Y.encodeStateAsUpdate(durable)),
          updates: [],
          inputDrafts: [],
          revision: "saved",
        }
      : null
  );
  io.write.mockImplementation(async payload => {
    if (!online) throw new Error("disk full");
    if (payload.state) Y.applyUpdate(durable, base64ToBytes(payload.state));
    if (payload.metadata) cached = structuredClone(payload.metadata);
    return "saved";
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await mount();
    const previous = editor!;
    online = false;
    await act(async () => {
      Transforms.insertText(previous, "待保存", { at: { path: [0, 0], offset: 2 } });
      await expect(document!.flush()).rejects.toThrow("disk full");
    });
    await act(async () => root.unmount());
    expect(previous.nodeTree.doc.isDestroyed).toBe(false);
    online = true;
    root = createTestRoot();
    await mount();
    expect(Node.string(editor!)).toBe("原文待保存");
    expect(previous.nodeTree.doc.isDestroyed).toBe(true);
    const saved = new NodeTree(durable);
    try {
      expect(Node.string(saved.read()[0] as Descendant)).toBe("原文待保存");
    } finally {
      saved.dispose();
    }
    expect(failures).toEqual([]);
  } finally {
    durable.destroy();
  }
});

it("视图退出后仍完成已经接受的输入写入，再释放文档", async () => {
  await mount();
  const previous = editor!;
  const durable = new Y.Doc();
  Y.applyUpdate(durable, base64ToBytes(io.write.mock.calls[0][0].state));
  let acknowledge!: () => void;
  const accepted = new Promise<void>(resolve => {
    acknowledge = resolve;
  });
  io.write.mockImplementationOnce(async payload => {
    await accepted;
    Y.applyUpdate(durable, base64ToBytes(payload.state));
    return "saved";
  });
  try {
    await act(async () =>
      Transforms.insertText(previous, "尾部", { at: { path: [0, 0], offset: 2 } })
    );
    live = false;
    await act(async () => root.unmount());
    expect(previous.nodeTree.doc.isDestroyed).toBe(false);
    await act(async () => acknowledge());
    expect(previous.nodeTree.doc.isDestroyed).toBe(true);
    const saved = new NodeTree(durable);
    try {
      expect(Node.string(saved.read()[0] as Descendant)).toBe("原文尾部");
    } finally {
      saved.dispose();
    }
  } finally {
    acknowledge();
    durable.destroy();
  }
});

it("页面意外报错只影响当前页面，重试和返回仍可继续使用", async () => {
  await mount();
  const previous = editor!;
  const error = new Error("internal editor failure");
  let broken = true;
  definePage({
    key: "broken",
    params: {},
    transition: { preset: "none", enterMs: 0, exitMs: 0 },
    component: () => {
      if (broken) throw error;
      return <input aria-label="recovered" />;
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await push("broken");
  expect(failures).toEqual([error]);
  expect(host.textContent).not.toContain(error.message);
  expect(previous.nodeTree.doc.isDestroyed).toBe(false);
  broken = false;
  const retry = host.querySelector<HTMLButtonElement>(
    '[data-page-key="broken"] [role="alert"] button'
  );
  if (!retry) throw new Error("缺少页面恢复入口");
  await act(async () => retry.click());
  expect(host.querySelector('input[aria-label="recovered"]')).not.toBeNull();
  failures.length = 0;
  await back("home");
  await act(async () =>
    Transforms.insertText(previous, "继续", { at: { path: [0, 0], offset: 2 } })
  );
  expect(Node.string(previous)).toBe("原文继续");
});

it("只关闭页内编辑器时释放会话，页面自身仍保留", async () => {
  let closeEditor!: () => void;
  function RootBody() {
    const [open, setOpen] = useState(true);
    closeEditor = () => setOpen(false);
    return open ? <Body /> : <input aria-label="page-retained" />;
  }
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <RouterProvider rootKey="home">
          <PageHost rootContent={<RootBody />} />
        </RouterProvider>
      </DndProvider>
    )
  );
  await vi.waitFor(() => expect(editor?.nodeTree).toBeDefined());
  const previous = editor!;
  await act(async () => closeEditor());
  expect(host.querySelector('input[aria-label="page-retained"]')).not.toBeNull();
  expect(previous.nodeTree.doc.isDestroyed).toBe(true);
});

it("嵌套页面和面板分别隐藏时保留同一文档，恢复后仍可撤销", async () => {
  const render = (pageHidden: boolean, panelHidden: boolean) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <PageResourceScope visible={!pageHidden}>
            <Activity mode={pageHidden ? "hidden" : "visible"}>
              <PageResourceScope visible={!panelHidden}>
                <Activity mode={panelHidden ? "hidden" : "visible"}>
                  <Body />
                </Activity>
              </PageResourceScope>
            </Activity>
          </PageResourceScope>
        </DndProvider>
      )
    );
  await render(false, false);
  await vi.waitFor(() => expect(editor?.nodeTree).toBeDefined());
  const previous = editor!;
  await act(async () =>
    Transforms.insertText(previous, "草稿", { at: { path: [0, 0], offset: 2 } })
  );
  for (const [pageHidden, panelHidden] of [
    [false, true],
    [true, true],
    [true, false],
    [false, false],
  ]) {
    await render(pageHidden, panelHidden);
    expect(previous.nodeTree.doc.isDestroyed).toBe(false);
  }
  expect(editor).toBe(previous);
  expect(Node.string(previous)).toBe("原文草稿");
  await act(async () => previous.undo());
  expect(Node.string(previous)).toBe("原文");
});
