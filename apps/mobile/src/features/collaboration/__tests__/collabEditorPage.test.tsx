// 回归测试：协作编辑页必须挂上底部工具条，并拿到 content 场景的 kit。
// 该页曾漏接线（无 controller、无 editorRef、无 portal 挂载点），正文聚焦后工具条始终不出现，
// 且扩展不全时 content-link / 附件 / 白板 / 数据库等节点无法正常渲染。
// 扩展现在由 kit 自带（不再逐处透传），所以这里断言拿到的是 content 场景的 kit。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const contentKitSentinel = vi.hoisted(() => ({ name: "content-kit-sentinel" }));
const navigatorMock = vi.hoisted(() => ({ push: vi.fn(), goBack: vi.fn() }));
const collabState = vi.hoisted(() => ({ readonly: false }));
const capturedEditorProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => contentKitSentinel,
  getMobileFlashcardKit: () => ({}),
}));
vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  const Editor = React.forwardRef(function MockEditor(
    props: Record<string, unknown>,
    ref: unknown
  ) {
    React.useImperativeHandle(ref as never, () => ({ getEditor: () => ({ selection: null }) }));
    capturedEditorProps.value = props;
    return React.createElement("div", {
      "data-testid": "collab-editor",
      tabIndex: 0,
      onFocus: props.onFocus as never,
      onBlur: props.onBlur as never,
    });
  });
  return { ...actual, Editor };
});

vi.mock("../hooks/useCollabSession", () => ({
  useCollabSession: () => ({
    // createYjsDocument 取 doc.guid 作谱系；编辑器被 mock，doc 只需带 guid
    binding: { documentId: "doc-1", doc: { guid: "doc-1" } },
    session: {
      id: "doc-1",
      title: "协作文档",
      role: "owner",
      status: "active",
      members: [],
      connection: "connected",
    },
    loading: false,
    error: undefined,
    readonly: collabState.readonly,
    presence: { onFocus: vi.fn(), onBlur: vi.fn() },
    status: { label: "已同步", tone: "live" },
    online: [],
    offline: false,
    retry: vi.fn(),
  }),
}));

vi.mock("../../../router", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigator: () => navigatorMock };
});

vi.mock("../../../components/PageHeader", () => ({
  PageHeader: () => <div data-testid="page-header" />,
  PageHeaderButton: () => null,
}));

vi.mock("../../../components/ActionSheet", () => {
  const ActionSheet = () => null;
  return { __esModule: true, ActionSheet, default: ActionSheet };
});

vi.mock("../../../hooks/useMobileTheme", () => ({
  useMobileTheme: () => ({ theme: "light" }),
}));

vi.mock("../components/CollaborationUI", () => ({
  AvatarStack: () => null,
  StatusDot: () => null,
}));

vi.mock("../../cards/editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@tau/editor/toolbar", () => ({
  calculateFloatingPosition: () => ({ left: 8, top: 8, placement: "top" }),
}));

vi.mock("../../../hooks/useKeyboardViewport", () => ({
  useKeyboardViewportState: () => ({
    viewportHeight: 844,
    keyboardHeight: 0,
    isKeyboardVisible: false,
  }),
}));

import { CollabEditorPage } from "../CollabEditorPage";

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';

describe("CollabEditorPage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    collabState.readonly = false;
    capturedEditorProps.value = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
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
    vi.restoreAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<CollabEditorPage documentId="doc-1" onBack={vi.fn()} onExit={vi.fn()} />);
    });
    // pageRootEl 经 ref 回调写入需一次状态更新，portal 挂载点在此时才可用
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function editorElement(): Promise<HTMLElement> {
    const editor = document.querySelector<HTMLElement>('[data-testid="collab-editor"]');
    if (!editor) throw new Error("协作编辑器未渲染");
    await act(async () => {
      editor.focus();
    });
    return editor;
  }

  it("未聚焦时不渲染工具条", async () => {
    await renderPage();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("聚焦正文后渲染工具条", async () => {
    await renderPage();
    await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();
  });

  it("失焦后收起工具条", async () => {
    await renderPage();
    const editor = await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    await act(async () => {
      editor.blur();
    });
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("只读态即使聚焦也收起工具条", async () => {
    collabState.readonly = true;
    await renderPage();
    await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("用 content 场景的 kit（扩展由 kit 自带，不再逐处透传）", async () => {
    await renderPage();
    expect(capturedEditorProps.value?.kit).toBe(contentKitSentinel);
  });

  it("正文滚动容器接入边缘渐隐（内容不足一屏时两带俱无）", async () => {
    await renderPage();
    const scroller = document.querySelector<HTMLElement>(".edge-fade-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller!.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(scroller!.style.getPropertyValue("--edge-bottom-on")).toBe("0");
  });
});
