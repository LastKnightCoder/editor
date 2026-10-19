import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms, type Element } from "slate";
import { describe, expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef, type EditorExtension } from "../index";
import header from "@tau/editor/extensions/header";
import { standardExtensions } from "../../presets/standard";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { resolveBlockMenuItems } from "../menu/resolveMenu";

async function mount(extensions: readonly EditorExtension[]) {
  const kit = createEditorKit({
    extensions,
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (readonly = false) =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            readonly={readonly}
            initValue={[{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }]}
          />
        </DndProvider>
      )
    );
  await render();
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    kit,
    editor,
    render,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("领域转换的真实装配", () => {
  it("只安装标题就能向段落贡献并执行转换，不依赖产品集合或旧转发命令", async () => {
    const view = await mount([header]);
    try {
      const target = view.editor.children[0] as Element;
      const menu = resolveBlockMenuItems(view.kit.assembly.menuSources, {
        editor: view.editor,
        element: target,
        path: [0],
      });
      expect(menu.map(item => item.key)).toEqual(["tau.transform"]);
      expect(menu[0].children?.map(item => item.key)).toEqual(["tau.transform.header"]);
      expect(view.kit.assembly.commands.get("tau.transform.node")).toBeUndefined();
      await act(async () => menu[0].children?.[0].children?.[1].onSelect?.());
      expect(view.editor.children[0]).toMatchObject({ type: "header", level: 2 });
      expect(Node.string(view.editor)).toBe("正文");
    } finally {
      await view.dispose();
    }
  });

  it("产品组合保留菜单顺序，旧命令转发给领域实现并保留正文", async () => {
    const view = await mount(standardExtensions);
    try {
      const target = view.editor.children[0] as Element;
      const menu = resolveBlockMenuItems(view.kit.assembly.menuSources, {
        editor: view.editor,
        element: target,
        path: [0],
      });
      expect(
        menu.find(item => item.key === "tau.transform")?.children?.map(item => item.key)
      ).toEqual([
        "tau.transform.header",
        "tau.transform.bulleted-list",
        "tau.transform.numbered-list",
        "tau.transform.highlight-block",
        "tau.transform.detail",
        "tau.transform.callout",
        "tau.transform.blockquote",
      ]);
      await act(async () => {
        view.editor.commands?.execute(
          "tau.transform.node",
          {
            target: "callout",
            options: {
              calloutType: "tip",
              title: "提示",
            },
          },
          target,
          [0]
        );
      });
      const container = view.editor.children[0] as Element;
      expect(container.type).toBe("callout");
      await act(async () => {
        view.editor.commands?.execute(
          "tau.transform.node",
          { target: "paragraph" },
          container,
          [0]
        );
      });
      expect(view.editor.children[0].type).toBe("paragraph");
      expect(Node.string(view.editor)).toBe("正文");
    } finally {
      await view.dispose();
    }
  });

  it.each(["blockquote", "callout", "detail", "highlight-block"] as const)(
    "%s 的多个段落转列表时保留正文和分项结构",
    async type => {
      const view = await mount(standardExtensions);
      try {
        await act(async () => {
          view.editor.commands?.execute(
            "tau.transform.to." + type,
            {},
            view.editor.children[0] as Element,
            [0]
          );
        });
        expect(view.editor.children[0].type).toBe(type);
        await act(async () => {
          Transforms.insertNodes(
            view.editor,
            { type: "paragraph", children: [{ type: "formatted", text: "补充" }] },
            { at: [0, 1] }
          );
        });
        await act(async () => {
          view.editor.commands?.execute(
            "tau.transform.to.bulleted-list",
            {},
            view.editor.children[0] as Element,
            [0]
          );
        });
        expect(view.editor.children).toEqual([
          {
            type: "bulleted-list",
            children: ["正文", "补充"].map(text => ({
              type: "list-item",
              children: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
            })),
          },
        ]);
      } finally {
        await view.dispose();
      }
    }
  );

  it("陈旧路径、非法参数和只读更新不能触发转换", async () => {
    const view = await mount([header]);
    try {
      const original = view.editor.children[0] as Element;
      await act(async () => {
        Transforms.insertNodes(
          view.editor,
          { type: "paragraph", children: [{ type: "formatted", text: "前文" }] },
          { at: [0] }
        );
        view.editor.commands?.execute(
          "tau.transform.to.header",
          { options: { level: 2 } },
          original,
          [0]
        );
      });
      expect(view.editor.children.map(node => node.type)).toEqual(["paragraph", "paragraph"]);
      await act(async () => {
        view.editor.commands?.execute(
          "tau.transform.to.header",
          { options: { level: 7 } },
          original,
          [1]
        );
      });
      expect(original.type).toBe("paragraph");
      await view.render(true);
      await act(async () => {
        view.editor.commands?.execute(
          "tau.transform.to.header",
          { options: { level: 2 } },
          original,
          [1]
        );
      });
      expect(view.editor.children.map(node => node.type)).toEqual(["paragraph", "paragraph"]);
      expect(Node.string(view.editor)).toBe("前文正文");
    } finally {
      await view.dispose();
    }
  });

  it("核心基础不提供领域转换，缺失目标命令不能创造未知节点", async () => {
    const view = await mount([]);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const target = view.editor.children[0] as Element;
      expect(
        resolveBlockMenuItems(view.kit.assembly.menuSources, {
          editor: view.editor,
          element: target,
          path: [0],
        })
      ).toEqual([]);
      expect(view.editor.commands?.execute("tau.transform.to.header", undefined, target, [0])).toBe(
        false
      );
      expect(view.editor.children[0]).toBe(target);
    } finally {
      warning.mockRestore();
      await view.dispose();
    }
  });
});
