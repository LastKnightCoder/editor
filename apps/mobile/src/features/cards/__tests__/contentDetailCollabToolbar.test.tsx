// 回归测试：卡片已发起协作时，详情页原地切换为协作编辑，正文聚焦后底部工具条必须出现。
// 现在全页只有一个编辑器实例（本机与协作是同谱系的两个文档源，切换即换源），工具栏控制器
// 读的就是它；历史上两个编辑器各自持 ref，切换时本地编辑器卸载把 ref 清空，控制器从此
// 读不到 editor，工具条（及全部格式按钮）静默失效。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slateEditor: { selection: null },
  /** 协作会话只读态（会话冻结/非 active） */
  readonly: false,
  /** 编辑器每次收到的文档源，用于断言正文归属 */
  documents: [] as unknown[],
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
        loaded.current?.({ contentId: 1, updateTime: 0, count: 0, content: [], card: undefined });
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
vi.mock("../../../components/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("../../../../components/ActionSheet", () => {
  const ActionSheet = () => null;
  return { __esModule: true, ActionSheet, default: ActionSheet };
});
vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock("@tau/editor/toolbar", () => ({
  calculateFloatingPosition: () => ({ left: 8, top: 8, placement: "top" }),
}));

/** 模拟内核 Editor：ref 暴露 getEditor，焦点回调直连（与 @tau/editor 一致） */
// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => ({}),
  getMobileFlashcardKit: () => ({}),
}));
vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  const Editor = React.forwardRef(function MockEditor(
    props: Record<string, unknown>,
    ref: unknown
  ) {
    React.useImperativeHandle(ref as never, () => ({ getEditor: () => harness.slateEditor }), []);
    harness.documents.push(props.document);
    return React.createElement("div", {
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

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';
const EDITOR_SELECTOR = '[data-testid="editor"]';

describe("ContentDetailPage 协作态的底部工具条", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.readonly = false;
    harness.documents = [];
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

  it("聚焦协作正文后渲染工具条", async () => {
    await renderCollabDetail();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();

    await focusCollabEditor();
    const toolbar = document.querySelector(TOOLBAR_SELECTOR);
    expect(toolbar).not.toBeNull();
    // 控制器拿到的是协作编辑器：格式按钮随之可用（此前 ref 为空时按钮全哑）
    expect(toolbar?.querySelector('[aria-label="加粗"]')).not.toBeNull();
  });

  it("失焦后收起工具条", async () => {
    await renderCollabDetail();
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
    await focusCollabEditor();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });
});
