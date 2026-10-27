import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { extensionsWithLayer } from "./extensions.fixture";
import { createRichTextExtension } from "../extensions/builtins";
import { createServiceRegistry } from "../extensions";
import { IWhiteboardRichText, embeddedTextOptions } from "../extensions/text";
import type { WhiteboardTextEditorProps } from "../extensions/text";

it("非编辑底板保持元素尺寸，编辑测量后失焦恢复几何边界", async () => {
  const observers = new Set<ResizeObserverCallback>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        observers.add(this.callback);
      }
      disconnect() {
        observers.delete(this.callback);
      }
      unobserve() {
        observers.delete(this.callback);
      }
    }
  );
  let props: WhiteboardTextEditorProps;
  function HostEditor(next: WhiteboardTextEditorProps) {
    props = next;
    return <div data-slate-editor style={next.style} />;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const resize = () => {
    for (const callback of [...observers])
      callback(
        [{ borderBoxSize: [{ inlineSize: 160, blockSize: 50 }] } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
  };
  try {
    await act(async () =>
      root.render(
        <WhiteBoard
          initData={[
            {
              id: "text",
              type: "richtext",
              x: 0,
              y: 0,
              width: 60,
              height: 50,
              maxWidth: 300,
              maxHeight: 200,
              resized: false,
              variant: "tinted",
              tone: "green",
              content: [{ type: "paragraph", children: [{ type: "formatted", text: "我" }] }],
            },
          ]}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
          extensions={[
            ...extensionsWithLayer(() => null).filter(item => item.id !== "tau.richtext"),
            createRichTextExtension(),
          ]}
          services={createServiceRegistry(register =>
            register(IWhiteboardRichText, {
              Editor: HostEditor,
              kit: embeddedTextOptions.kit,
            })
          )}
        />
      )
    );
    const surface = host.querySelector<HTMLElement>("#rich-text-container-text > div")!;
    await act(async () => resize());
    expect(surface.style.width).toBe("60px");
    await act(async () => props.onFocus?.());
    await act(async () => resize());
    expect(surface.style.width).toBe("160px");
    await act(async () => {
      props.onBlur?.();
      await new Promise(resolve => setTimeout(resolve, 130));
    });
    const bounds = surface.closest("foreignObject")!;
    expect(surface.style.width).toBe(`${bounds.getAttribute("width")}px`);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
