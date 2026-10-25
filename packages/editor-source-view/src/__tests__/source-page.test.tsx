import { Activity, act, createRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor as SlateApi, Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Code2 } from "lucide-react";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import {
  IEditorInteraction,
  IOverlayBackDismiss,
  defineExtension,
  defineElement,
  focusNextBlock,
  type ElementRenderProps,
  type OverlayBackDismissProps,
} from "@tau/editor/api";
import { SourceBlockEditor } from "@tau/editor/source";
import { PreviewWithEditor, useReportPreviewError } from "../index";
import { previewActionsMap } from "../menu";

type SourceElement = { type: "test-source"; source: string; children: Descendant[] };
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "test-source": SourceElement;
  }
}

const previewClicked = vi.fn();
/** 预览：源码含 ERR 时上报渲染错误 */
const Preview = ({ source }: { source: string }) => {
  useReportPreviewError(source.includes("ERR") ? "编译失败：ERR" : null, { stale: false });
  return <output onClick={previewClicked}>{source}</output>;
};

/** 字段绑定：经 SDK 的 SourceBlockEditor 绑定 source 字段 */
const BoundBlock = ({ attributes, element, children }: ElementRenderProps<SourceElement>) => (
  <div {...attributes}>
    <SourceBlockEditor title="源码" icon={Code2} mode="stex" field="source" element={element}>
      <Preview source={element.source} />
    </SourceBlockEditor>
    {children}
  </div>
);

/** 非绑定：旧式 initValue + onChange 整段写回 */
const ValueBlock = ({ attributes, element, children }: ElementRenderProps<SourceElement>) => {
  const editor = useSlateStatic();
  return (
    <div {...attributes}>
      <PreviewWithEditor
        title="源码"
        icon={Code2}
        mode="text"
        element={element as never}
        initValue={element.source}
        onChange={source =>
          Transforms.setNodes(editor, { source } as never, {
            at: ReactEditor.findPath(editor, element),
          })
        }
      >
        <Preview source={element.source} />
      </PreviewWithEditor>
      {children}
    </div>
  );
};

const extensionFor = (bound: boolean) =>
  defineExtension({
    id: bound ? "test.source-bound" : "test.source-value",
    elements: [
      defineElement<SourceElement>({
        type: "test-source",
        kind: "block",
        isVoid: true,
        dataVersion: 1,
        collaboration: { textFields: ["source"] },
        render: props => (bound ? <BoundBlock {...props} /> : <ValueBlock {...props} />),
      }),
    ],
  });

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

describe("触屏源码页", () => {
  let root: Root;
  let host: HTMLDivElement;
  let editor: SlateEditor;
  let backLayer: OverlayBackDismissProps | null = null;
  let setHidden: (hidden: boolean) => void = () => {};
  const outerInput = vi.fn();
  const outerKey = vi.fn();

  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    backLayer = null;
    outerInput.mockClear();
    outerKey.mockClear();
    previewClicked.mockClear();
  });

  const mount = async ({ bound = true, readonly = false, initial = "\\draw" } = {}) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [extensionFor(bound)],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          register(IEditorInteraction, { touch: true });
          register(IOverlayBackDismiss, {
            Layer: props => {
              if (props.open) backLayer = props;
              return null;
            },
          });
        },
      ],
    });
    const Outer = ({ children }: { children: ReactNode }) => {
      const [hidden, update] = useState(false);
      setHidden = update;
      return (
        <div onInput={outerInput} onKeyDown={outerKey}>
          <Activity mode={hidden ? "hidden" : "visible"}>{children}</Activity>
        </div>
      );
    };
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Outer>
            <Editor
              ref={ref}
              kit={kit}
              readonly={readonly}
              initValue={[
                paragraph("前"),
                {
                  type: "test-source",
                  source: initial,
                  children: [{ type: "formatted", text: "" }],
                },
                paragraph("后"),
              ]}
            />
          </Outer>
        </DndProvider>
      )
    );
    editor = ref.current!.getEditor();
  };

  const source = () => (editor.children[1] as SourceElement).source;
  const page = () => document.querySelector<HTMLElement>("[data-source-editor-page]");
  const textarea = () => page()!.querySelector("textarea")!;
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      item => item.textContent === label || item.getAttribute("aria-label") === label
    );
  const click = async (label: string) => {
    const target = button(label);
    expect(target, label).toBeDefined();
    await act(async () => target!.click());
  };
  const openPage = async () => {
    await act(async () => {
      document.dispatchEvent(
        new CustomEvent("preview-editor-focus", { detail: editor.children[1] })
      );
    });
  };
  const type = async (value: string) => {
    await act(async () => {
      const input = textarea();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        input,
        value
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("打开后预览移进页面、只挂一份，返回后放回正文", async () => {
    await mount();
    const block = host.querySelector("[data-source-presentation]")!;
    expect(block.querySelector("output")?.textContent).toBe("\\draw");
    await openPage();
    expect(page()).toBeTruthy();
    expect(page()!.closest("[data-slate-editor]")).toBeNull();
    expect(document.querySelectorAll("output")).toHaveLength(1);
    expect(page()!.querySelector("[data-source-preview] output")).toBeTruthy();
    expect(block.querySelector("output")).toBeNull();
    expect(textarea().value).toBe("\\draw");
    await click("返回");
    expect(page()).toBeNull();
    expect(block.querySelector("output")?.textContent).toBe("\\draw");
  });

  it("字段绑定：输入即时写入并实时刷新页面里的预览，撤销重做走字段历史", async () => {
    await mount();
    await openPage();
    await type("\\draw (0,0);");
    expect(source()).toBe("\\draw (0,0);");
    expect(page()!.querySelector("output")?.textContent).toBe("\\draw (0,0);");
    await click("撤销");
    expect(source()).toBe("\\draw");
    expect(textarea().value).toBe("\\draw");
    await click("重做");
    expect(source()).toBe("\\draw (0,0);");
  });

  it("源码页的输入与按键不冒泡到外层正文", async () => {
    await mount();
    await openPage();
    const before = JSON.stringify(editor.children[0]);
    await act(async () => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    await type("\\fill");
    expect(outerKey).not.toHaveBeenCalled();
    expect(outerInput).not.toHaveBeenCalled();
    expect(JSON.stringify(editor.children[0])).toBe(before);
  });

  it("系统返回与 Esc 都关闭源码页", async () => {
    await mount();
    await openPage();
    expect(backLayer?.open).toBe(true);
    await act(async () => backLayer!.onDismiss());
    expect(page()).toBeNull();
    await openPage();
    await act(async () => {
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(page()).toBeNull();
  });

  it("页面隐藏（Activity）时收起源码页，预览回到正文", async () => {
    await mount();
    await openPage();
    await type("隐藏前");
    await act(async () => setHidden(true));
    expect(page()).toBeNull();
    await act(async () => setHidden(false));
    expect(page()).toBeNull();
    expect(source()).toBe("隐藏前");
    expect(host.querySelector("output")?.textContent).toBe("隐藏前");
  });

  it("只读文档：点按不拦截预览里的交互，也不进入编辑", async () => {
    await mount({ readonly: true });
    const before = editor.selection;
    await act(async () => host.querySelector("output")!.click());
    expect(previewClicked).toHaveBeenCalledTimes(1);
    expect(editor.selection).toEqual(before);
    await openPage();
    expect(previewActionsMap.get(editor.children[1] as never)?.edit()).toBe(false);
    expect(page()).toBeNull();
  });

  it("非绑定模式停顿后写回，返回时立即写入且只进一次撤销", async () => {
    await mount({ bound: false });
    await openPage();
    expect(button("撤销")).toBeUndefined();
    await type("A");
    expect(source()).toBe("\\draw");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(source()).toBe("A");
    await type("AB");
    await click("返回");
    expect(source()).toBe("AB");
    await act(async () => (editor as SlateEditor & { undo(): void }).undo());
    expect(source()).toBe("A");
  });

  it("非绑定模式：外部改写时页面以节点源码为准", async () => {
    await mount({ bound: false });
    await openPage();
    await act(async () => {
      Transforms.setNodes(editor, { source: "外部" } as never, { at: [1] });
    });
    expect(textarea().value).toBe("外部");
    await click("返回");
    expect(source()).toBe("外部");
  });

  describe("正文块", () => {
    const block = () => host.querySelector<HTMLElement>("[data-source-presentation]")!;

    it("正文只显示预览，没有按钮；点按把选区放进块并显示选中外框", async () => {
      await mount();
      expect(block().querySelectorAll("button")).toHaveLength(0);
      await act(async () => host.querySelector("output")!.click());
      expect(SlateApi.above(editor, { at: editor.selection!, voids: true })?.[1]).toEqual([1]);
      expect(block().firstElementChild!.className).toContain("outline-[var(--ed-accent)]");
      expect(page()).toBeNull();
    });

    it("空块显示斜纹占位，点按直接打开源码页", async () => {
      await mount({ initial: "" });
      expect(block().textContent).toContain("源码 · 点按开始编写");
      expect(host.querySelector("output")?.closest("[hidden], .hidden")).toBeTruthy();
      const placeholder = [...block().querySelectorAll("div")].findLast(
        item => item.textContent === "源码 · 点按开始编写"
      );
      await act(async () => placeholder!.click());
      expect(page()).toBeTruthy();
    });

    it("打开源码页时正文不保留选区，返回后选中本块", async () => {
      await mount();
      await act(async () => {
        Transforms.select(editor, SlateApi.start(editor, [0]));
      });
      await openPage();
      expect(editor.selection).toBeNull();
      await click("返回");
      expect(SlateApi.above(editor, { at: editor.selection!, voids: true })?.[1]).toEqual([1]);
    });

    it("前一块按方向键进入时打开源码页", async () => {
      await mount();
      await act(async () => {
        focusNextBlock(editor, [0], { reason: "arrow", direction: "forward" });
      });
      expect(page()).toBeTruthy();
    });

    it("登记动作：块名与图标，编辑打开源码页，复制写入剪贴板", async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      await mount();
      const actions = previewActionsMap.get(editor.children[1] as never)!;
      expect(actions.title).toBe("源码");
      expect(actions.readOnly).toBe(false);
      expect(actions.icon).toBe(Code2);
      await act(async () => actions.copySource());
      expect(writeText).toHaveBeenCalledWith("\\draw");
      await act(async () => {
        actions.edit();
      });
      expect(page()).toBeTruthy();
    });

    it("渲染出错时在块下显示错误条，打开源码页后改在状态行显示", async () => {
      await mount({ initial: "\\draw ERR" });
      expect(block().querySelector('[role="alert"]')?.textContent).toContain("编译失败：ERR");
      await openPage();
      expect(block().querySelector('[role="alert"]')).toBeNull();
      expect(page()!.querySelector('[role="alert"]')?.textContent).toContain("编译失败：ERR");
    });

    it("宽内容在块内横向滚动，不撑出正文", async () => {
      await mount();
      expect(block().querySelector("[data-source-preview-slot]")!.className).toContain(
        "overflow-x-auto"
      );
    });
  });
});
