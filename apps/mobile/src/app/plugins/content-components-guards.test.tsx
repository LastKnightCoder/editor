import { Activity, act, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createEditor, Transforms, type Descendant } from "slate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createNodeDocument, NODE_DOCUMENT_VERSION, type ContentNode } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import type { NodeTreeEditor } from "@tau/editor-collab";
import type { EditorDocument } from "@tau/editor";
import { IEditorNodeViews } from "@tau/editor/source-contracts";
import useLocalContentDocument, {
  type LocalContentDocument,
} from "../../hooks/useLocalContentDocument";
import useCollaborationDocument from "../../features/collaboration/hooks/useCollaborationDocument";
import { useCollabProjection } from "../../features/collaboration/hooks/useCollabProjection";
import type { ContentDetailResponse } from "../../types";
import { PageResourceScope } from "../../router/PageResourceScope";
import { mobileLocaleSource } from "../../services/i18n";
import { useRoomI18n, documentIssueText } from "../../features/collaboration/room.i18n";
import { collaborationManager } from "../../features/collaboration/core/manager";
import { toast } from "../../components/toast";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  discard: vi.fn(),
  views: vi.fn(),
  updateView: vi.fn(),
  draft: vi.fn(),
  runtime: null as any,
  contractId: "",
}));
vi.mock("../../services/tauri", () => ({
  collabReadCache: io.read,
  collabWriteCache: io.write,
  collabDiscardCache: io.discard,
  collabNodeViews: io.views,
  collabUpdateNodeView: io.updateView,
  collabInputDraft: io.draft,
  collabListBindings: async () => [],
}));
vi.mock("../../services/editorKit", () => ({
  getMobileContentKit: () => ({ extensions: [], registry: { get: () => ({}) } }),
}));
vi.mock("./content", () => ({
  mobileContentPlugins: {
    subscribe: () => () => undefined,
    getRevision: () => 0,
    prepareEditorContracts: async () => ({
      additionalContracts: () => ({}),
      resolve: () => ({ access: "edit", element: { type: "paragraph", kind: "block" } }),
      current: () => ({ id: io.contractId }),
    }),
  },
}));
vi.mock("../../components/toast", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock("../../features/collaboration/core/manager", () => ({
  collaborationManager: {
    session: () => io.runtime,
    project: vi.fn(async () => undefined),
    openDocument: vi.fn(async () => undefined),
    preserveInputDraft: vi.fn(async () => undefined),
  },
}));
vi.mock("../../features/collaboration/core/store", () => ({
  useCollaborationStore: (select: any) => select({ sessions: io.runtime ? [io.runtime.info] : [] }),
}));

const cleanups: (() => Promise<void>)[] = [];
async function mount(read: () => void) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  function Harness() {
    read();
    return null;
  }
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await act(async () => root.unmount());
    element.remove();
  };
  cleanups.push(close);
  await act(async () => root.render(<Harness />));
  return close;
}
async function settle(check: () => boolean) {
  for (let i = 0; i < 70 && !check(); i++)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  expect(check()).toBe(true);
}
async function source() {
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    kind: "block",
    dataVersion: 1,
  });
  io.contractId = contract.id;
  const content = [
    {
      type: "paragraph",
      collabId: "p",
      tauContract: contract.id,
      children: [{ type: "formatted", text: "原文" }],
    } as unknown as Descendant,
  ];
  const metadata: ContentDetailResponse = {
    contentId: 7,
    createTime: 1,
    updateTime: 1,
    content,
    count: 2,
    card: null,
    librarySourceId: "library",
    documentId: "body",
    revision: "revision",
    contracts: { [contract.id]: contract.contract },
  };
  return { content, metadata, contract };
}
function connect(document: EditorDocument) {
  if (!document.binding) throw new Error("文档没有真实绑定");
  const editor = document.binding.install(createEditor()) as NodeTreeEditor;
  document.binding.connect(editor);
  return editor;
}
beforeEach(() => {
  vi.clearAllMocks();
  io.runtime = null;
  io.read.mockResolvedValue(null);
  io.write.mockResolvedValue("cache-revision");
  io.views.mockResolvedValue({});
  io.updateView.mockResolvedValue({ expanded: true });
});
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  vi.useRealTimers();
});

it("真实本地NodeTree在撤权后立即拒绝写入，异步节点视图结果也不再交付", async () => {
  const { content, metadata } = await source();
  let writable = true,
    live = true;
  const guard = () => {
    if (!live) throw new Error("会话已失效");
  };
  let document: LocalContentDocument | undefined;
  const close = await mount(() => {
    document = useLocalContentDocument({
      contentId: 7,
      content,
      metadata,
      version: 1,
      canWrite: () => writable,
      guard,
      onChange: vi.fn(),
    });
  });
  await settle(() => !!document?.binding);
  const view = document as LocalContentDocument;
  const editor = connect(view);
  try {
    await act(async () => {
      Transforms.insertText(editor, "甲", { at: { path: [0, 0], offset: 2 } });
      await view.flush();
    });
    expect(JSON.stringify(editor.nodeTree.read())).toContain("原文甲");
    writable = false;
    expect(() =>
      Transforms.insertText(editor, "不允许", { at: { path: [0, 0], offset: 3 } })
    ).toThrow("只读");
    expect(JSON.stringify(editor.nodeTree.read())).not.toContain("不允许");
    let views: any;
    view.services?.((token, value) => {
      if (token === IEditorNodeViews) views = value;
    });
    await expect(views.write("p", { expanded: true })).rejects.toThrow("不可编辑");
    expect(io.updateView).not.toHaveBeenCalled();
    writable = true;
    let finish!: (value: unknown) => void;
    io.updateView.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = views.write("p", { expanded: true });
    live = false;
    finish({ expanded: true });
    await expect(pending).rejects.toThrow("会话已失效");
    expect(() =>
      Transforms.insertText(editor, "迟到", { at: { path: [0, 0], offset: 3 } })
    ).toThrow("只读");
  } finally {
    editor.disposeNodeTree();
    await close();
  }
});

it("本地缓存读取完成前会话失效，不再重建或写入该缓存", async () => {
  const { content, metadata } = await source();
  let finish!: (value: null) => void,
    live = true;
  io.read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await mount(() => {
    useLocalContentDocument({
      contentId: 7,
      content,
      metadata,
      version: 1,
      guard: () => {
        if (!live) throw new Error("失效");
      },
      canWrite: () => live,
      onChange: vi.fn(),
    });
  });
  live = false;
  await act(async () => finish(null));
  expect(io.write).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
});

it("真实共享文档组合会话与插件写权限，撤权不修改原Y.Doc", async () => {
  const { content, metadata } = await source();
  const doc = await createNodeDocument(
    { documentId: "room", baselineId: "base", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: content as ContentNode[] },
    metadata.contracts ?? {}
  );
  io.runtime = {
    doc,
    info: { id: "room", role: "owner", status: "active", frozen: false },
    nodeViews: {},
  };
  let writable = true;
  let result: ReturnType<typeof useCollaborationDocument> | undefined;
  const close = await mount(() => {
    result = useCollaborationDocument("room", { canWrite: () => writable });
  });
  await settle(() => !!result?.document);
  if (!result?.document) throw new Error("共享文档未就绪");
  const editor = connect(result.document);
  try {
    Transforms.insertText(editor, "甲", { at: { path: [0, 0], offset: 2 } });
    const before = Y.encodeStateAsUpdate(doc);
    writable = false;
    expect(() =>
      Transforms.insertText(editor, "拒绝", { at: { path: [0, 0], offset: 3 } })
    ).toThrow("只读");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally {
    editor.disposeNodeTree();
    await close();
    doc.destroy();
  }
});

it("共享投影定时及卸载清理都受当前授权约束", async () => {
  vi.useFakeTimers();
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", NODE_DOCUMENT_VERSION);
  let writable = true;
  const project = vi.fn(async () => undefined);
  const close = await mount(() =>
    useCollabProjection({ doc } as any, 7, { canWrite: () => writable, project })
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(project).toHaveBeenCalledOnce();
  writable = false;
  await vi.advanceTimersByTimeAsync(2000);
  await close();
  expect(project).toHaveBeenCalledOnce();
  doc.destroy();
});

it("共享正文隐藏后重连保留输入和历史，关闭视图不销毁共享文档", async () => {
  const { content, metadata } = await source();
  const doc = await createNodeDocument(
    { documentId: "room", baselineId: "base", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: content as ContentNode[] },
    metadata.contracts ?? {}
  );
  io.runtime = {
    doc,
    info: { id: "room", role: "owner", status: "active", frozen: false },
    nodeViews: {},
  };
  let editor: NodeTreeEditor | undefined;
  function Body() {
    const result = useCollaborationDocument("room");
    const document = result.document;
    const bound = useMemo(
      () => document?.binding?.install(createEditor()) as NodeTreeEditor | undefined,
      [document?.lineage]
    );
    useEffect(() => {
      if (!bound || !document?.binding) return;
      document.binding.connect(bound);
      editor = bound;
      return () => document.binding?.disconnect(bound);
    }, [document, bound]);
    return null;
  }
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const render = (hidden: boolean) =>
    act(async () =>
      root.render(
        <PageResourceScope visible={!hidden}>
          <Activity mode={hidden ? "hidden" : "visible"}>
            <Body />
          </Activity>
        </PageResourceScope>
      )
    );
  try {
    await render(false);
    await vi.waitFor(() => expect(editor?.nodeTree).toBeDefined());
    const initial = editor!;
    await act(async () =>
      Transforms.insertText(initial, "甲", { at: { path: [0, 0], offset: 2 } })
    );
    await render(true);
    await render(false);
    expect(editor).toBe(initial);
    expect(initial.nodeTree.read()[0].children?.[0].text).toBe("原文甲");
    await act(async () => initial.undo());
    expect(initial.nodeTree.read()[0].children?.[0].text).toBe("原文");
    await act(async () => root.unmount());
    expect(initial.nodeTree.isDisposed).toBe(true);
    expect(doc.isDestroyed).toBe(false);
  } finally {
    await act(async () => root.unmount());
    editor?.disposeNodeTree();
    doc.destroy();
    element.remove();
  }
});

it("协作加载错误保留原cause，切语不重开文档；格式不支持仅按稳定code解释", async () => {
  const original = mobileLocaleSource.getSnapshot();
  const cause = { trace: "raw-load-cause" };
  vi.mocked(collaborationManager.openDocument).mockRejectedValueOnce(cause);
  let result: ReturnType<typeof useCollaborationDocument> | undefined;
  const close = await mount(function LoadProbe() {
    const context = useRoomI18n();
    result = useCollaborationDocument("load-room");
    if (result.error) documentIssueText(result.error, context);
  });
  try {
    const issue = result?.error;
    if (!issue) throw new Error("加载错误未返回");
    expect(issue).toMatchObject({ kind: "failure", cause });
    expect(issue.cause).toBe(cause);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(result?.error).toBe(issue);
      expect(collaborationManager.openDocument).toHaveBeenCalledExactlyOnceWith("load-room");
    }
  } finally {
    await close();
    mobileLocaleSource.setLocale(original);
  }
  const doc = new Y.Doc();
  io.runtime = {
    doc,
    info: { id: "format-room", role: "owner", status: "active", frozen: false },
    nodeViews: {},
  };
  let unsupported: ReturnType<typeof useCollaborationDocument> | undefined;
  const formatClose = await mount(function FormatProbe() {
    const context = useRoomI18n();
    unsupported = useCollaborationDocument("format-room");
    if (unsupported.error) documentIssueText(unsupported.error, context);
    expect(documentIssueText({ kind: "failure", cause: "正文格式不受支持" }, context)).toBe(
      "正文格式不受支持"
    );
  });
  try {
    const issue = unsupported?.error;
    if (!issue) throw new Error("格式错误未返回");
    expect(issue).toMatchObject({
      kind: "coded",
      code: "CONTENT_FORMAT_UNSUPPORTED",
      cause: "CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持",
    });
    const binding = unsupported?.binding;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(unsupported?.error).toBe(issue);
      expect(unsupported?.binding).toBe(binding);
      expect(unsupported?.frozen).toBe(true);
      expect(collaborationManager.openDocument).toHaveBeenCalledTimes(1);
    }
  } finally {
    await formatClose();
    doc.destroy();
    mobileLocaleSource.setLocale(original);
  }
});

it("协作投影换语不重启2秒调度或再次警告，清理仍受当前授权约束", async () => {
  vi.useFakeTimers();
  const original = mobileLocaleSource.getSnapshot();
  const doc = new Y.Doc();
  doc.getMap("meta").set("version", NODE_DOCUMENT_VERSION);
  const binding = { doc };
  let writable = true;
  const failure = new Error("用户原始投影诊断 trace-42");
  const project = vi.fn(async () => {
    throw failure;
  });
  const close = await mount(function ProjectionProbe() {
    useRoomI18n();
    useCollabProjection(binding, 7, { canWrite: () => writable, project });
  });
  try {
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(project).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(failure.message);
    await act(async () => {
      mobileLocaleSource.setLocale("zh-TW");
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(project).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    await act(async () => {
      mobileLocaleSource.setLocale("en-US");
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(project).toHaveBeenCalledTimes(2);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    writable = false;
    await close();
    expect(project).toHaveBeenCalledTimes(2);
  } finally {
    await close();
    doc.destroy();
    mobileLocaleSource.setLocale(original);
  }
});
