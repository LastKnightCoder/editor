// P4：EditorConfig 字段拆到服务 / 扩展参数后，钉住每个字段的新入口与默认行为。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, EditorProvider, PlantUMLExtension } from "../index";
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

  const mount = async (initValue: Descendant[], registrations: ServiceRegistration[] = []) => {
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
    // 拦掉 <a href> 的默认跳转（jsdom 不支持导航），不影响编辑器自己的点击处理
    const preventNavigation = (event: Event) => event.preventDefault();
    host.addEventListener("click", preventNavigation);
    await act(async () => {
      leaf!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    host.removeEventListener("click", preventNavigation);
  };

  describe("openUrl → IOpenerService", () => {
    it("注册了 IOpenerService 时，只读点击链接交给服务打开", async () => {
      const open = vi.fn();
      const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
      const host = await mount(linkDoc("https://example.com"), [
        register => register(IOpenerService, { open }),
      ]);
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

  describe("plantumlServer / plantumlDarkTheme → plantuml 扩展参数", () => {
    // PlantUMLBlock 懒加载且依赖布局 API，jsdom 里挂不出来；这里钉住扩展把参数交给块组件
    const renderProps = (extension: PlantUMLExtension) => {
      const element = extension.render({
        attributes: {} as never,
        element: { type: "plantuml", content: "", children: [{ type: "formatted", text: "" }] },
        children: null,
      } as never);
      return element.props as { server?: string; darkTheme?: string };
    };

    it("未传参数时不覆盖，由 @tau/shared 的默认值生效", () => {
      const props = renderProps(new PlantUMLExtension());
      expect(props.server).toBeUndefined();
      expect(props.darkTheme).toBeUndefined();
    });

    it("扩展参数传给块组件", () => {
      const props = renderProps(
        new PlantUMLExtension({ server: "https://uml.example.com", darkTheme: "" })
      );
      expect(props.server).toBe("https://uml.example.com");
      expect(props.darkTheme).toBe("");
    });
  });
});
