import { IOpenerService } from "@tau/shared/host-services";
// P4：EditorConfig 字段拆到服务 / 扩展参数后，钉住每个字段的新入口与默认行为。
import { act, isValidElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, type EditorExtension } from "../index";
import type { ElementRenderProps } from "../api";
import { createHeaderExtension } from "@tau/editor/extensions/header";
import { type ImageAppearanceConfig, type ImageAppearanceSource } from "@tau/editor/extensions/media";
import { useImageAppearance } from "../../extensions/media/src/extensions/image/appearanceOption";
import headerExtension from "@tau/editor/extensions/header";
import { default as linkExtension } from "@tau/editor/extensions/link";
import { createImageExtensions } from "@tau/editor/extensions/media";
import { type ServiceRegistration } from "../services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

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
    const kit = createEditorKit({
      extensions: [headerExtension, linkExtension],
      services: [register => register(IEditorSlots, createDefaultEditorSlots()), ...registrations],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <Editor kit={kit} initValue={initValue} readonly />
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

  describe("appearance.image → image / image-gallery 扩展参数", () => {
    const probe = async (option: Parameters<typeof useImageAppearance>[0]) => {
      const seen: Array<ImageAppearanceConfig | undefined> = [];
      const Probe = () => {
        seen.push(useImageAppearance(option));
        return null;
      };
      container = document.createElement("div");
      root = createRoot(container);
      await act(async () => {
        root?.render(<Probe />);
      });
      return seen;
    };

    it("固定值直接生效", async () => {
      const seen = await probe({ borderRadius: "lg", shadow: "md" });
      expect(seen.at(-1)).toEqual({ borderRadius: "lg", shadow: "md" });
    });

    it("可订阅来源变化时刷新，不必重建扩展", async () => {
      let current: ImageAppearanceConfig = { borderRadius: "sm" };
      const listeners = new Set<() => void>();
      const source: ImageAppearanceSource = {
        get: () => current,
        subscribe: listener => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      const seen = await probe(source);
      expect(seen.at(-1)).toEqual({ borderRadius: "sm" });
      await act(async () => {
        current = { borderRadius: "lg", shadow: true };
        listeners.forEach(listener => listener());
      });
      expect(seen.at(-1)).toEqual({ borderRadius: "lg", shadow: true });
    });

    it("createImageExtensions 同时覆盖 image 与 image-gallery，并把参数交给块组件", () => {
      const appearance = { borderRadius: "md" as const };
      const extensions = createImageExtensions({ appearance });
      const typeOf = (extension: EditorExtension) => extension.elements?.[0]?.type;
      expect(extensions.map(typeOf)).toEqual(["image", "image-gallery"]);
      for (const extension of extensions) {
        const spec = extension.elements?.[0];
        if (!spec) throw new Error("图片工厂未提供元素声明");
        const props = {
          attributes: {} as never,
          element: { type: typeOf(extension), children: [{ type: "formatted", text: "" }] },
          children: null,
        } as never;
        const render = spec.render as FunctionComponent<ElementRenderProps>;
        const element = render(props);
        if (!isValidElement<{ appearance?: unknown }>(element))
          throw new Error("图片工厂必须返回元素");
        expect(element.props.appearance).toBe(appearance);
      }
    });
  });

  describe("features.disableHeaderCollapse → header 扩展参数", () => {
    const headerDoc: Descendant[] = [
      {
        type: "header",
        level: 2,
        collapsed: true,
        children: [{ type: "formatted", text: "标题" }],
      } as Descendant,
      { type: "paragraph", children: [{ type: "formatted", text: "正文" }] } as Descendant,
    ];

    const mountWith = async (extensions?: EditorExtension[]) => {
      const kit = createEditorKit({
        extensions: [headerExtension],
        services: [register => register(IEditorSlots, createDefaultEditorSlots())],
      });
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root?.render(
          <DndProvider backend={HTML5Backend}>
            <Editor kit={kit} initValue={headerDoc} readonly extensions={extensions} />
          </DndProvider>
        );
      });
      return container;
    };

    // 折叠态靠 CSS 隐藏后续块，这里只看交互入口（折叠箭头）
    const arrowOf = (host: HTMLElement) => host.querySelector('h2 [data-icon="caret-right"]');

    it("默认显示折叠箭头", async () => {
      expect(arrowOf(await mountWith())).toBeTruthy();
    });

    it("disableCollapse 时不显示折叠箭头", async () => {
      expect(
        arrowOf(await mountWith([createHeaderExtension({ disableCollapse: true })]))
      ).toBeNull();
    });
  });
});
