// P4：EditorConfig 字段拆到服务 / 扩展参数后，钉住每个字段的新入口与默认行为。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, EditorProvider } from "../index";
import {
  createServiceRegistry,
  createDefaultEditorSlots,
  IEditorSlots,
  IOpenerService,
  type ServiceRegistration,
} from "../services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linkDoc = (url: string): Descendant[] => [
  {
    type: "paragraph",
    children: [
      { type: "formatted", text: "" },
      { type: "link", url, children: [{ type: "formatted", text: "链接" }] },
      { type: "formatted", text: "" },
    ],
  } as Descendant,
];

describe("P4 EditorConfig 拆解", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const mount = async (initValue: Descendant[], ...registrations: ServiceRegistration[]) => {
    const registry = createServiceRegistry(
      register => {
        register(IEditorSlots, createDefaultEditorSlots());
      },
      ...registrations
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <EditorProvider registry={registry}>
            <Editor initValue={initValue} readonly />
          </EditorProvider>
        </DndProvider>
      );
    });
    return container;
  };

  const clickLink = async (host: HTMLElement) => {
    // 点在链接文字的叶子上：Slate 的 onClick 要能从事件目标反查到节点
    const leaf = host.querySelector("a [data-slate-string]");
    expect(leaf).toBeTruthy();
    await act(async () => {
      leaf!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  describe("openUrl → IOpenerService", () => {
    it("注册了 IOpenerService 时，只读点击链接交给服务打开", async () => {
      const open = vi.fn();
      const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
      const host = await mount(linkDoc("https://example.com"), register =>
        register(IOpenerService, { open })
      );
      await clickLink(host);
      expect(open).toHaveBeenCalledWith("https://example.com");
      expect(windowOpen).not.toHaveBeenCalled();
    });

    it("未注册时回落 window.open 新开标签页", async () => {
      const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
      const host = await mount(linkDoc("https://example.com"));
      await clickLink(host);
      expect(windowOpen).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener,noreferrer"
      );
    });
  });
});
