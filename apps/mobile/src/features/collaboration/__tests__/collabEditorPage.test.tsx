// 回归测试：协作编辑页必须挂上底部工具条，并拿到 content 场景的 kit；已有内容默认阅读态。
// 该页曾漏接线（无 controller、无 editorRef、无 portal 挂载点），正文聚焦后工具条始终不出现，
// 且扩展不全时 content-link / 附件 / 白板 / 数据库等节点无法正常渲染。
// 扩展现在由 kit 自带（不再逐处透传），所以这里断言拿到的是 content 场景的 kit。
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant } from "slate";

const contentKitSentinel = vi.hoisted(() => ({ name: "content-kit-sentinel" }));
const navigatorMock = vi.hoisted(() => ({ push: vi.fn(), goBack: vi.fn() }));
const collabState = vi.hoisted(() => ({
  readonly: false,
  /** 编辑器 ref 暴露的 Slate 实例，children 即协作文档当前正文 */
  slateEditor: null as unknown,
}));
const capturedEditorProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

// 页面测试不渲染真实编辑器，kit 也不必真实构造
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => contentKitSentinel,
  useMobileContentKit: () => contentKitSentinel,
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
    React.useImperativeHandle(ref as never, () => ({
      getEditor: () => collabState.slateEditor,
      getEditableElement: () => null,
      focus: () => element.current?.focus(),
    }));
    capturedEditorProps.value = props;
    return React.createElement("div", {
      ref: element,
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
  PageHeader: (props: { actions?: ReactNode; children?: ReactNode }) => (
    <div data-testid="page-header">
      {props.children}
      {props.actions}
    </div>
  ),
  PageHeaderButton: (props: { "aria-label"?: string; onClick?: () => void }) => (
    <button type="button" aria-label={props["aria-label"]} onClick={props.onClick} />
  ),
}));

// 面板直接平铺选项，便于点击「选择块」等菜单项
vi.mock("../../../components/ActionSheet", () => {
  const ActionSheet = (props: {
    open: boolean;
    items?: Array<{ label: string; onClick: () => void }>;
  }) =>
    props.open ? (
      <div data-testid="action-sheet">
        {(props.items ?? []).map(item => (
          <button key={item.label} type="button" onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </div>
    ) : null;
  return { __esModule: true, ActionSheet, default: ActionSheet };
});

vi.mock("../components/CollaborationUI", () => ({
  AvatarStack: () => null,
  StatusDot: () => null,
}));

vi.mock("../../cards/editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../../../hooks/useKeyboardViewport", () => ({
  useKeyboardViewportState: () => ({
    viewportHeight: 844,
    keyboardHeight: 0,
    isKeyboardVisible: false,
  }),
}));

import { CollabEditorPage } from "../CollabEditorPage";
import { setMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../../types";

function createSlateEditor(children: unknown[]) {
  const editor = createEditor();
  editor.children = children as Descendant[];
  return editor;
}

const EXISTING_CONTENT = [
  { type: "paragraph", children: [{ type: "formatted", text: "已有内容" }] },
];

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';

describe("CollabEditorPage", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    collabState.readonly = false;
    collabState.slateEditor = createSlateEditor(EXISTING_CONTENT);
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
    setMobileSettingSnapshot(null);
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

  async function clickEdit() {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="编辑"]');
    if (!button) throw new Error("「编辑」按钮未渲染");
    await act(async () => {
      button.click();
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

  it("已有内容默认阅读态：正文只读，聚焦也不显示工具条", async () => {
    await renderPage();
    expect(capturedEditorProps.value?.readonly).toBe(true);
    await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("空文档直接进入编辑", async () => {
    collabState.slateEditor = createSlateEditor([]);
    await renderPage();
    expect(capturedEditorProps.value?.readonly).toBe(false);
  });

  it("「打开文档时」偏好为直接编辑：已有内容打开即编辑态", async () => {
    setMobileSettingSnapshot({ editor: { openMode: "edit" } } as SettingCompat);
    await renderPage();
    expect(capturedEditorProps.value?.readonly).toBe(false);
  });

  it("点「编辑」后渲染工具条，「完成」回阅读态", async () => {
    await renderPage();
    await clickEdit();
    expect(capturedEditorProps.value?.readonly).toBe(false);
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    const done = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent === "完成"
    );
    await act(async () => {
      done?.click();
    });
    expect(capturedEditorProps.value?.readonly).toBe(true);
    expect(document.querySelector('button[aria-label="编辑"]')).not.toBeNull();
  });

  it("聚焦正文后渲染工具条", async () => {
    await renderPage();
    await clickEdit();
    await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();
  });

  it("失焦后收起工具条", async () => {
    await renderPage();
    await clickEdit();
    const editor = await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    await act(async () => {
      editor.blur();
    });
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  it("协作只读时不显示「编辑」，聚焦也收起工具条", async () => {
    collabState.readonly = true;
    await renderPage();
    expect(document.querySelector('button[aria-label="编辑"]')).toBeNull();
    expect(capturedEditorProps.value?.readonly).toBe(true);
    await editorElement();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
  });

  function sheetButton(label: string) {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="action-sheet"] button')
    ).find(button => button.textContent === label);
  }

  it("「更多」→「选择块」进入块选择：顶栏与操作栏替换，取消恢复阅读态", async () => {
    await renderPage();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]')?.click();
    });
    await act(async () => {
      sheetButton("选择块")?.click();
    });
    expect(document.querySelector('[data-block-action-bar="true"]')).not.toBeNull();
    expect(document.querySelector('[data-block-selection-hit="true"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="编辑"]')).toBeNull();
    expect(capturedEditorProps.value?.readonly).toBe(false);

    const cancel = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "取消"
    );
    await act(async () => {
      cancel?.click();
    });
    expect(document.querySelector('[data-block-action-bar="true"]')).toBeNull();
    expect(capturedEditorProps.value?.readonly).toBe(true);
  });

  it("「更多」→「整理结构」打开大纲 Sheet，每个顶层块一行", async () => {
    await renderPage();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]')?.click();
    });
    await act(async () => {
      sheetButton("整理结构")?.click();
    });
    const rows = document.querySelectorAll("[data-outline-row]");
    expect(rows).toHaveLength(EXISTING_CONTENT.length);
    expect(rows[0].textContent).toContain("已有内容");
  });

  it("协作只读时「更多」不提供「选择块」与「整理结构」", async () => {
    collabState.readonly = true;
    await renderPage();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]')?.click();
    });
    expect(sheetButton("成员管理")).toBeDefined();
    expect(sheetButton("选择块")).toBeUndefined();
    expect(sheetButton("整理结构")).toBeUndefined();
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
