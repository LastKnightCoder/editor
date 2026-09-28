// 回归测试：卡片已发起协作时，详情页原地切换为协作编辑，正文聚焦后底部工具条必须出现。
// 曾因协作编辑器与本地占位编辑器共用同一个 editorRef，local→collab 切换时本地编辑器卸载
// 把 ref.current 清成 null，而协作编辑器的命令式句柄不会重新挂载——工具栏控制器从此读不到
// editor，聚焦回调提前 return，工具条（及全部格式按钮）静默失效。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slateEditor: { selection: null },
  /** 协作会话只读态（会话冻结/非 active） */
  readonly: false,
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
vi.mock("../../../hooks/useMobileTheme", () => ({ useMobileTheme: () => ({ theme: "light" }) }));
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
vi.mock("@tau/editor/src/components/HoveringToolbar/floatingPosition", () => ({
  calculateFloatingPosition: () => ({ left: 8, top: 8, placement: "top" }),
}));

/** 模拟内核 Editor：ref 暴露 getEditor，焦点回调直连（与 @tau/editor 一致） */
// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => ({}),
  getMobileFlashcardKit: () => ({}),
}));
vi.mock("@tau/editor/src", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  const Editor = React.forwardRef(function MockEditor(
    props: Record<string, unknown>,
    ref: unknown
  ) {
    React.useImperativeHandle(ref as never, () => ({ getEditor: () => harness.slateEditor }), []);
    return React.createElement("div", {
      "data-testid": "editor",
      tabIndex: 0,
      onFocus: props.onFocus as never,
      onBlur: props.onBlur as never,
    });
  });
  return { ...actual, Editor };
});

/** 模拟真实协作编辑器：上报 live 模式与只读态，editorRef 转发给内部 Editor */
vi.mock("../../collaboration/CollaborativeEditor", async () => {
  const React = await import("react");
  const editorModule = await import("@tau/editor/src");
  const Mock = function MockCollab(props: Record<string, unknown>) {
    const callbacks = React.useRef(props);
    callbacks.current = props;
    React.useEffect(() => {
      (callbacks.current.onModeChange as (mode: string) => void)("live");
      (callbacks.current.onReadonlyChange as (readonly: boolean) => void)(harness.readonly);
    }, []);
    return React.createElement(
      "div",
      { "data-testid": "collab-editor" },
      React.createElement(editorModule.Editor, {
        ref: props.editorRef as never,
        onFocus: props.onEditorFocus as never,
        onBlur: props.onEditorBlur as never,
      })
    );
  };
  return { CollaborativeEditor: Mock, default: Mock };
});

import { ContentDetailPage } from "../ContentDetailPage";

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';
const COLLAB_EDITOR_SELECTOR = '[data-testid="collab-editor"] [data-testid="editor"]';

describe("ContentDetailPage 协作态的底部工具条", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.readonly = false;
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
    const editor = document.querySelector<HTMLElement>(COLLAB_EDITOR_SELECTOR);
    if (!editor) throw new Error("协作编辑器未渲染");
    await act(async () => {
      editor.focus();
    });
    return editor;
  }

  it("协作 live 时只渲染协作编辑器（本地占位退场）", async () => {
    await renderCollabDetail();
    expect(document.querySelectorAll('[data-testid="editor"]')).toHaveLength(1);
    expect(document.querySelector(COLLAB_EDITOR_SELECTOR)).not.toBeNull();
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
