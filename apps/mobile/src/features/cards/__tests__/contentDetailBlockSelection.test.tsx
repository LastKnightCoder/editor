// 详情页块选择模式接入：把手进入 → 顶栏与操作栏替换、配件栏隐藏、正文保持可写（点击由覆盖层拦截）→ 取消恢复；
// actionsRef 入口（page「⋯ → 选择块」）在阅读态进入并选中 0 个块；「⋯ → 整理结构」先收起编辑态 / 块选择再打开大纲；
// 长按把手提起拖拽：拖拽中配件栏隐藏，松手后顶层块顺序改变。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  Node as SlateNode,
  type Descendant,
  type Editor as SlateEditor,
  type Node,
} from "slate";

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
vi.mock("../TagChips", () => ({ default: () => null }));
vi.mock("../TagInlineEditor", () => ({ default: () => null }));
vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));
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

import { HANDLE_DRAG_DELAY_MS } from "../blockSelection/blockHandleState";
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
    expect(buttonByLabel("删除")).toBeNull();
    expect(document.querySelector(ACTION_BAR_SELECTOR)?.textContent).toContain("点按段落来选择");
    expect(harness.readonlyProps.at(-1)).toBe(false);

    await act(async () => {
      buttonByText("取消")?.click();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).toBeNull();
    expect(harness.readonlyProps.at(-1)).toBe(true);
  });

  it("actionsRef.openOutline：编辑态先回阅读态再打开大纲，块选择中打开则退出块选择", async () => {
    const actionsRef = createRef<ContentDetailActions>();
    await act(async () => {
      root.render(
        <ContentDetailPage contentId={1} openInEditMode actionsRef={actionsRef} onBack={vi.fn()} />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.readonlyProps.at(-1)).toBe(false);
    await act(async () => {
      actionsRef.current?.openOutline();
    });
    expect(harness.readonlyProps.at(-1)).toBe(true);
    expect(document.querySelectorAll("[data-outline-row]")).toHaveLength(3);

    await act(async () => {
      buttonByText("取消")?.click();
    });
    await act(async () => {
      actionsRef.current?.enterBlockSelection();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).not.toBeNull();
    await act(async () => {
      actionsRef.current?.openOutline();
    });
    expect(document.querySelector(ACTION_BAR_SELECTOR)).toBeNull();
  });

  it("长按把手提起拖拽：拖拽中配件栏隐藏、越过相邻块后显示插入线，松手后块顺序改变且原块恢复可见", async () => {
    // 三个块：[0,30]、[40,100]、[120,150]
    const layout = [
      [0, 30],
      [40, 60],
      [120, 30],
    ];
    harness.blockDoms.forEach((element, index) => {
      const [top, height] = layout[index];
      element.getBoundingClientRect = () =>
        ({ top, height, bottom: top + height, left: 0, right: 300, width: 300 }) as DOMRect;
    });
    await renderEditingDetail();
    const handle = buttonByLabel("选择块")!;
    expect(handle.dataset.blockHandle).toBe("1");
    expect(document.querySelector(TOOLBAR_SELECTOR)).not.toBeNull();

    vi.useFakeTimers();
    try {
      const pointer = (target: EventTarget, type: string, clientY: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, { clientX: 10, clientY, pointerId: 1 });
        act(() => {
          target.dispatchEvent(event);
        });
      };
      pointer(handle, "pointerdown", 50);
      act(() => {
        vi.advanceTimersByTime(HANDLE_DRAG_DELAY_MS);
      });
      expect(document.querySelector(TOOLBAR_SELECTOR)).toBeNull();
      // 落点仍在原位：不画插入线
      expect(document.querySelector('[data-block-drop-line="true"]')).toBeNull();
      expect(harness.blockDoms[1].style.opacity).toBe("0");

      // 第二段中心 70 下移 100 越过第三段中线 135
      pointer(window, "pointermove", 150);
      expect(document.querySelector('[data-block-drop-line="true"]')).not.toBeNull();
      pointer(window, "pointerup", 150);
    } finally {
      vi.useRealTimers();
    }
    const editor = harness.slateEditor as SlateEditor;
    expect(editor.children.map(node => SlateNode.string(node))).toEqual([
      "第一段",
      "第三段",
      "第二段",
    ]);
    expect(editor.selection?.anchor.path).toEqual([2, 0]);
    expect(document.querySelector('[data-block-drop-line="true"]')).toBeNull();
    expect(harness.blockDoms[1].style.opacity).toBe("");
  });

  it("阅读态不显示把手", async () => {
    await act(async () => {
      root.render(<ContentDetailPage contentId={1} onBack={vi.fn()} />);
    });
    expect(buttonByLabel("编辑")).not.toBeNull();
    expect(buttonByLabel("选择块")).toBeNull();
  });
});
