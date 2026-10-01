import { act, createRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss } from "@tau/editor/api";
import { IEditorSlots } from "@tau/editor-media/services";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { mathExtensions } from "@tau/editor-math";
import { htmlExtensions } from "@tau/editor-html";
import { previewMenuExtension } from "@tau/editor-source-view/menu";
import { PageProvider, useOverlayDismiss } from "../../page/PageProvider";
import { definePage } from "../../page/definePage";
import { DesktopEditorOverlayDismiss } from "../editorOverlayDismiss";

// 输入器布局不属于此测试；保留真实预览、公式、编辑器作用域与宿主仲裁。
vi.mock("react-codemirror2", () => ({
  UnControlled: ({ value }: { value: string }) => <textarea defaultValue={value} />,
}));
vi.mock("motion/react", async importOriginal => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));
Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

definePage({
  key: "editor-overlay-integration",
  match: "single",
  label: "浮层集成",
  params: {},
  component: () => null,
});

const kit = createEditorKit({
  extensions: [...mathExtensions, ...htmlExtensions, previewMenuExtension],
  services: [
    register => {
      register(IEditorSlots, createDefaultEditorSlots());
      register(IOverlayBackDismiss, { Layer: DesktopEditorOverlayDismiss });
    },
  ],
});
const editorRef = createRef<EditorRef>();
function Content({ visible }: { visible: boolean }) {
  return visible ? (
    <Editor
      ref={editorRef}
      kit={kit}
      readonly={false}
      initValue={[
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "前" },
            { type: "inline-math", tex: "x^2", children: [{ type: "formatted", text: "" }] },
            { type: "formatted", text: "后" },
          ],
        },
        {
          type: "html-block",
          html: "<b>源码预览</b>",
          children: [{ type: "formatted", text: "" }],
        },
      ]}
    />
  ) : null;
}
function Host({ editorVisible }: { editorVisible: boolean }) {
  const [hostOpen, setHostOpen] = useState(true);
  useOverlayDismiss(() => setHostOpen(false), hostOpen);
  return (
    <>
      <output data-host-open>{String(hostOpen)}</output>
      <Content visible={editorVisible} />
    </>
  );
}

describe("真实编辑器浮层与页面仲裁", () => {
  let root: Root;
  let host: HTMLDivElement;
  const settle = async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });
  };
  const render = async (editorVisible = true, withPage = true) => {
    if (!host) {
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
    }
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          {withPage ? (
            <PageProvider initialKey="editor-overlay-integration">
              <Host editorVisible={editorVisible} />
            </PageProvider>
          ) : (
            <Content visible={editorVisible} />
          )}
        </DndProvider>
      )
    );
    await settle();
    await settle();
  };
  const escape = async (target: EventTarget = window) => {
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await settle();
  };
  const openMath = async () => {
    const formula = host.querySelector(".katex");
    if (!formula) throw new Error("公式未挂载");
    await act(async () => {
      formula.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="输入 LaTeX 公式..."]'
    );
    if (!input) throw new Error("公式输入框未打开");
    return input;
  };
  const openFullscreen = async () => {
    const editor = editorRef.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    await act(async () => {
      expect(
        editor.commands?.execute(
          "tau.preview.fullscreen",
          undefined,
          editor.children[1] as never,
          [1]
        )
      ).toBe(true);
    });
    expect(document.querySelector(".fixed.inset-0")).toBeTruthy();
  };
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    host = undefined as unknown as HTMLDivElement;
  });

  it("公式输入框 Escape 只关闭公式，不重复消费宿主浮层", async () => {
    await render();
    const input = await openMath();
    await escape(input);
    expect(document.querySelector('input[placeholder="输入 LaTeX 公式..."]')).toBeNull();
    expect(host.querySelector("[data-host-open]")?.textContent).toBe("true");
    await escape();
    expect(host.querySelector("[data-host-open]")?.textContent).toBe("false");
  });

  it("源码全屏先于宿主退场，卸载编辑器后不残留登记", async () => {
    await render();
    await openFullscreen();
    await escape();
    expect(document.querySelector(".fixed.inset-0")).toBeNull();
    expect(host.querySelector("[data-host-open]")?.textContent).toBe("true");
    await openFullscreen();
    await render(false);
    await escape();
    expect(host.querySelector("[data-host-open]")?.textContent).toBe("false");
  });

  it("无 Page 上下文时不注册全局监听，公式焦点链仍可关闭", async () => {
    await render(true, false);
    const input = await openMath();
    await escape(input);
    expect(document.querySelector('input[placeholder="输入 LaTeX 公式..."]')).toBeNull();
    expect(editorRef.current?.getEditor().children[0]).toMatchObject({ type: "paragraph" });
  });
});
