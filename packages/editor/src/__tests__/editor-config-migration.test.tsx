// P4：EditorConfig 字段拆到服务 / 扩展参数后，钉住每个字段的新入口与默认行为。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import {
  Editor,
  createPlantUMLExtension,
  type ImageAppearanceConfig,
  type ImageAppearanceSource,
  createEditorKit,
  createHeaderExtension,
  type EditorExtension,
} from "../index";
import { useImageAppearance } from "../extensions/image/appearanceOption";
import { createImageExtensions } from "../extensions/image/createImageExtensions";
import {
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
    const kit = createEditorKit({
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

  describe("plantumlServer / plantumlDarkTheme → plantuml 扩展参数", () => {
    // PlantUMLBlock 懒加载且依赖布局 API，jsdom 里挂不出来；这里钉住扩展把参数交给块组件
    const renderProps = (extension: ReturnType<typeof createPlantUMLExtension>) => {
      const element = (
        extension.elements![0].render as (props: unknown) => {
          props: { server?: string; darkTheme?: string };
        }
      )({
        attributes: {} as never,
        element: { type: "plantuml", content: "", children: [{ type: "formatted", text: "" }] },
        children: null,
      } as never);
      return element.props;
    };

    it("未传参数时不覆盖，由 @tau/shared 的默认值生效", () => {
      const props = renderProps(createPlantUMLExtension());
      expect(props.server).toBeUndefined();
      expect(props.darkTheme).toBeUndefined();
    });

    it("扩展参数传给块组件", () => {
      const props = renderProps(
        createPlantUMLExtension({ server: "https://uml.example.com", darkTheme: "" })
      );
      expect(props.server).toBe("https://uml.example.com");
      expect(props.darkTheme).toBe("");
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
      // image 迁移前是旧 IExtension（type/render 在顶层）、迁移后在 elements 里
      const typeOf = (extension: unknown) =>
        (extension as { type?: string }).type ??
        ((extension as { elements?: { type: string }[] }).elements?.[0].type as string);
      expect(extensions.map(typeOf)).toEqual(["image", "image-gallery"]);
      for (const extension of extensions) {
        // 旧 IExtension 的 render 是类方法（依赖 this），保持方法调用；v2 的在 elements[0]
        const props = {
          attributes: {} as never,
          element: { type: typeOf(extension), children: [{ type: "formatted", text: "" }] },
          children: null,
        } as never;
        const legacy = extension as { render?: (props: unknown) => unknown };
        const element =
          typeof legacy.render === "function"
            ? legacy.render(props)
            : (
                extension as { elements: { render: (props: unknown) => unknown }[] }
              ).elements[0].render(props);
        expect((element.props as { appearance?: unknown }).appearance).toBe(appearance);
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
