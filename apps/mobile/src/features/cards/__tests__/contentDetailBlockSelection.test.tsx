// 详情页块选择模式接入：把手进入 → 顶栏与操作栏替换、配件栏隐藏、正文保持可写（点击由覆盖层拦截）→ 取消恢复；
// actionsRef 入口（page「⋯ → 选择块」）在阅读态进入并选中 0 个块。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant, type Editor as SlateEditor, type Node } from "slate";

const harness = vi.hoisted(() => ({
  slateEditor: null as unknown,
  readonlyProps: [] as boolean[],
  blockDoms: [] as HTMLElement[],
}));

vi.mock("slate-react", async importOriginal => {
  const actual = await importOriginal<typeof import("slate-react")>();
  return {
    ...actual,
    ReactEditor: {
      ...actual.ReactEditor,
      toDOMNode: (editor: SlateEditor, node: Node) => {
        const element = harness.blockDoms[editor.children.indexOf(node as Descendant)];
        if (!element) throw new Error("no dom");
        return element;
      },
    },
  };
});

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
          content: (harness.slateEditor as SlateEditor).children,
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
vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));
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

import { ContentDetailPage, type ContentDetailActions } from "../ContentDetailPage";

const TOOLBAR_SELECTOR = '[data-mobile-editor-toolbar="true"]';
const ACTION_BAR_SELECTOR = '[data-block-action-bar="true"]';

function buttonByLabel(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function buttonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find(
    button => button.textContent?.trim() === text
  );
}

describe("ContentDetailPage 块选择模式", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.readonlyProps = [];
    const slateEditor = createEditor();
    slateEditor.children = ["第一段", "第二段", "第三段"].map(text => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    })) as unknown as Descendant[];
    slateEditor.selection = {
      anchor: { path: [1, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    };
    harness.slateEditor = slateEditor;
    harness.blockDoms = slateEditor.children.map(() => document.createElement("div"));
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

  async function renderEditingDetail() {
    await act(async () => {
      root.render(<ContentDetailPage contentId={1} openInEditMode onBack={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("编辑态显示把手，点击进入块选择：顶栏与操作栏替换，配件栏隐藏，正文可写供块命令执行；取消恢复", async () => {
    await renderEditingDetail();
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();
    const handle = buttonByLabel("选择块");
    expect(handle?.dataset.blockHandle).toBe("1");

    await act(async () => {
      handle?.click();
    });
    expect(document.body.textContent).toContain("已选 1 个块");
    expect(document.querySelector(ACTION_BAR_SELECTOR)).not.toBeNull();
    expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
    expect(buttonByLabel("选择块")).toBeNull();
    expect(buttonByLabel("编辑")).toBeNull();
    expect(harness.readonlyProps.at(-1)).toBe(false);
    expect(document.querySelector('[data-block-selection-hit="true"]')).not.toBeNull();
    expect(document.querySelector('[data-block-highlight="1"]')).not.toBeNull();

    await act(async () => {
      buttonByText("全选")?.click();
    });
    expect(document.body.textContent).toContain("已选 3 个块");

    await act(async () => {
      buttonByText("取消")?.click();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).toBeNull();
    expect(document.querySelector('[data-block-highlight="1"]')).toBeNull();
    // 退出块选择回到阅读态
    expect(buttonByLabel("编辑")).not.toBeNull();
    expect(harness.readonlyProps.at(-1)).toBe(true);
  });

  it("actionsRef.enterBlockSelection：阅读态进入块选择，选中 0 个块，取消回阅读态", async () => {
    const actionsRef = createRef<ContentDetailActions>();
    await act(async () => {
      root.render(<ContentDetailPage contentId={1} actionsRef={actionsRef} onBack={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.readonlyProps.at(-1)).toBe(true);
    await act(async () => {
      actionsRef.current?.enterBlockSelection();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).not.toBeNull();
    expect(document.body.textContent).toContain("选择块");
    expect(document.querySelector("[data-block-highlight]")).toBeNull();
    expect(buttonByLabel("删除")?.disabled).toBe(true);
    expect(harness.readonlyProps.at(-1)).toBe(false);

    await act(async () => {
      buttonByText("取消")?.click();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).toBeNull();
    expect(harness.readonlyProps.at(-1)).toBe(true);
  });

  it("阅读态不显示把手", async () => {
    await act(async () => {
      root.render(<ContentDetailPage contentId={1} onBack={vi.fn()} />);
    });
    expect(buttonByLabel("编辑")).not.toBeNull();
    expect(buttonByLabel("选择块")).toBeNull();
  });
});
