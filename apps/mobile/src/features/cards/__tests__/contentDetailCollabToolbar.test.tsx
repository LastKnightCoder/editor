// 回归测试：卡片已发起协作时，详情页原地切换为协作编辑，正文聚焦后底部工具条必须出现。
// 现在全页只有一个编辑器实例（本机与协作是同谱系的两个文档源，切换即换源），工具栏控制器
// 读的就是它；历史上两个编辑器各自持 ref，切换时本地编辑器卸载把 ref 清空，控制器从此
// 读不到 editor，工具条（及全部格式按钮）静默失效。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant } from "slate";

const harness = vi.hoisted(() => ({
  slateEditor: null as unknown,
  /** 协作会话只读态（会话冻结/非 active） */
  readonly: false,
  /** 编辑器每次收到的文档源，用于断言正文归属 */
  documents: [] as unknown[],
  /** 编辑器每次收到的 readonly */
  readonlyProps: [] as boolean[],
  /** 详情加载回来的正文；非空文档默认进入阅读态 */
  content: [
    { type: "paragraph", children: [{ type: "formatted", text: "已有内容" }] },
  ] as unknown[],
}));

vi.mock("../../../hooks/useEditContent", async () => {
  const React = await import("react");
  return {
    useEditContent: (
      _contentId: number | undefined,
      options?: { onLoaded?: (detail: unknown) => void }
    ) => {
      const loaded = React.useRef(options?.onLoaded);
      React.useEffect(() => {
        loaded.current?.({
          contentId: 1,
          updateTime: 0,
          count: 0,
          content: harness.content,
          card: undefined,
        });
      }, []);
      return {
        content: [],
        syncVersion: 0,
        loading: false,
        saving: false,
        error: "",
        handleEditorContentChange: vi.fn(),
        flushNow: async () => true,
      };
    },
  };
});

vi.mock("../../../services/tauri", () => ({ updateCardTags: vi.fn() }));
vi.mock("../../../hooks/useScrollState", () => ({ useEdgeFade: vi.fn() }));
vi.mock("../editorExtensions", () => ({ mobileCardPreviewExtensions: [] }));
vi.mock("../LinksDisclosure", () => ({ default: () => null }));
vi.mock("../TagChips", () => ({ default: () => null }));
vi.mock("../TagInlineEditor", () => ({ default: () => null }));
vi.mock("../../../components/PageHeader", async () => {
  const React = await import("react");
  return {
    PageHeader: (props: { actions?: React.ReactNode }) =>
      React.createElement("header", null, props.actions),
  };
});
vi.mock("../../../../components/ActionSheet", () => {
  const ActionSheet = () => null;
  return { __esModule: true, ActionSheet, default: ActionSheet };
});
vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

/** 模拟内核 Editor：ref 暴露 getEditor，焦点回调直连（与 @tau/editor 一致） */
// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => ({}),
  useMobileContentKit: () => ({}),
  getMobileFlashcardKit: () => ({}),
}));
vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  const Editor = React.forwardRef(function MockEditor(
    props: Record<string, unknown>,
    ref: unknown
  ) {
    const element = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle(
      ref as never,
      () => ({
        getEditor: () => harness.slateEditor,
        getEditableElement: () => null,
        focus: () => element.current?.focus(),
      }),
      []
    );
    harness.readonlyProps.push(props.readonly as boolean);
    harness.documents.push(props.document);
    return React.createElement("div", {
      ref: element,
      "data-testid": "editor",
      tabIndex: 0,
      onFocus: props.onFocus as never,
      onBlur: props.onBlur as never,
    });
  });
  return { ...actual, Editor };
});

/** 模拟协作会话组件：上报 live 模式、只读态与协作文档源（正文由宿主的那个编辑器渲染） */
vi.mock("../../collaboration/CollaborativeEditor", async () => {
  const React = await import("react");
  const Mock = function MockCollab(props: Record<string, unknown>) {
    const callbacks = React.useRef(props);
    callbacks.current = props;
    React.useEffect(() => {
      (callbacks.current.onModeChange as (mode: string) => void)("live");
      (callbacks.current.onReadonlyChange as (readonly: boolean) => void)(harness.readonly);
      (callbacks.current.onDocumentChange as (document: unknown) => void)({
        lineage: "content:1",
        history: "external",
        initialValue: [],
        binding: {},
      });
    }, []);
    return React.createElement("div", { "data-testid": "collab-session" });
  };
  return { CollaborativeEditor: Mock, default: Mock };
});

import { ContentDetailPage } from "../ContentDetailPage";
import { setMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../../types";

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';
const EDITOR_SELECTOR = '[data-testid="editor"]';

describe("ContentDetailPage 协作态的底部工具条", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.readonly = false;
    harness.documents = [];
    harness.readonlyProps = [];
    const slateEditor = createEditor();
    slateEditor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "已有内容" }] },
    ] as unknown as Descendant[];
    harness.slateEditor = slateEditor;
    harness.content = [{ type: "paragraph", children: [{ type: "formatted", text: "已有内容" }] }];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--mobile-editor-toolbar-occlusion");
    setMobileSettingSnapshot(null);
  });

  async function renderCollabDetail() {
    await act(async () => {
      root.render(
        <ContentDetailPage
          contentId={1}
          contentTitle="卡片"
          collaboration={{ documentId: "doc-1" }}
          onBack={vi.fn()}
        />
      );
    });
    // 详情加载（onLoaded）与懒加载的协作编辑器各需一轮提交
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function clickEdit() {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="编辑"]');
    if (!button) throw new Error("「编辑」按钮未渲染");
    await act(async () => {
      button.click();
    });
  }

  async function focusCollabEditor() {
    const editor = document.querySelector<HTMLElement>(EDITOR_SELECTOR);
    if (!editor) throw new Error("编辑器未渲染");
    await act(async () => {
      editor.focus();
    });
    return editor;
  }

  it("全页只有一个编辑器实例，协作会话另行挂载", async () => {
    await renderCollabDetail();
    expect(document.querySelectorAll(EDITOR_SELECTOR)).toHaveLength(1);
    expect(document.querySelector('[data-testid="collab-session"]')).not.toBeNull();
  });

  it("协作 live 时正文用协作文档源", async () => {
    await renderCollabDetail();
    expect(harness.documents[harness.documents.length - 1]).toMatchObject({
      lineage: "content:1",
      history: "external",
    });
  });

  it("已有内容默认阅读态：正文只读，聚焦也不显示工具条", async () => {
    await renderCollabDetail();
    expect(harness.readonlyProps[harness.readonlyProps.length - 1]).toBe(true);
    await focusCollabEditor();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("空文档直接进入编辑并自动聚焦", async () => {
    harness.content = [];
    await renderCollabDetail();
    expect(harness.readonlyProps[harness.readonlyProps.length - 1]).toBe(false);
    expect(document.activeElement).toBe(document.querySelector(EDITOR_SELECTOR));
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();
  });

  it("「打开文档时」偏好为直接编辑：已有内容打开即编辑态并自动聚焦", async () => {
    setMobileSettingSnapshot({ editor: { openMode: "edit" } } as SettingCompat);
    await renderCollabDetail();
    expect(harness.readonlyProps[harness.readonlyProps.length - 1]).toBe(false);
    expect(document.activeElement).toBe(document.querySelector(EDITOR_SELECTOR));
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();
  });

  it("点「编辑」后聚焦正文并渲染工具条，「完成」回阅读态", async () => {
    await renderCollabDetail();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();

    await clickEdit();
    expect(harness.readonlyProps[harness.readonlyProps.length - 1]).toBe(false);
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    const done = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent === "完成"
    );
    await act(async () => {
      done?.click();
    });
    expect(harness.readonlyProps[harness.readonlyProps.length - 1]).toBe(true);
    expect(document.querySelector('button[aria-label="编辑"]')).not.toBeNull();
  });

  it("聚焦协作正文后渲染工具条", async () => {
    await renderCollabDetail();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();

    await clickEdit();
    await focusCollabEditor();
    const toolbar = document.querySelector(TOOLBAR_SELECTOR);
    expect(toolbar).not.toBeNull();
    // 控制器拿到的是协作编辑器：配件栏按钮随之可用（此前 ref 为空时按钮全哑）
    expect(toolbar?.querySelector('[aria-label="无序列表"]')).not.toBeNull();
  });

  it("失焦后收起工具条", async () => {
    await renderCollabDetail();
    await clickEdit();
    const editor = await focusCollabEditor();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    await act(async () => {
      editor.blur();
    });
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("协作只读态即使聚焦也收起工具条", async () => {
    harness.readonly = true;
    await renderCollabDetail();
    expect(document.querySelector('button[aria-label="编辑"]')).toBeNull();
    await focusCollabEditor();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });
});
