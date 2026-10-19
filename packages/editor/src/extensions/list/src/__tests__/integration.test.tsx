import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, Transforms, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "@tau/editor/api";
import { listExtensions, type ListItemElement } from "../index";

vi.mock("@emoji-mart/react", () => ({
  default: () => <div data-emoji-picker />,
}));

const paragraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

async function mount(value: Descendant[], readonly = false) {
  const dismissals = new Set<() => void>();
  function Layer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  const kit = createEditorKit({
    extensions: listExtensions,
    services: [register => register(IOverlayBackDismiss, { Layer })],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    editor,
    host,
    dismissals,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("仅安装列表即可输入快捷语法和缩进，不需要上传服务", async () => {
  const view = await mount([paragraph("-")]);
  try {
    await act(async () => {
      Transforms.select(view.editor, { path: [0, 0], offset: 1 });
      view.editor.insertText(" ");
    });
    expect(view.editor.children[0].type).toBe("bulleted-list");
    await act(async () => view.editor.insertText("第一项"));
    await act(async () => view.editor.insertBreak());
    await act(async () => view.editor.insertText("第二项"));
    await act(async () =>
      Transforms.select(view.editor, SlateEditor.start(view.editor, [0, 1, 0]))
    );
    await act(async () => view.editor.commands?.execute("tau.list-item.indent"));
    expect(Node.string(view.editor)).toBe("第一项第二项");
    expect(view.editor.children[0]).toMatchObject({
      children: [{ children: [{ type: "paragraph" }, { type: "bulleted-list" }] }],
    });
  } finally {
    await view.dispose();
  }
});

it("空列表回车退出为段落，图标浮层经宿主返回关闭", async () => {
  const view = await mount([
    {
      type: "bulleted-list",
      children: [
        {
          type: "list-item",
          children: [paragraph("")],
        },
      ],
    },
  ]);
  try {
    const bullet = view.host.querySelector(".ed-list-item > div.absolute") as HTMLElement;
    expect(bullet).toBeTruthy();
    expect(document.querySelector("[data-emoji-picker]")).toBeNull();
    await act(async () => bullet.click());
    expect(view.dismissals.size).toBe(1);
    expect(document.querySelector("[data-emoji-picker]")).toBeTruthy();
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    expect(document.querySelector("[data-emoji-picker]")).toBeNull();
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.start(view.editor, [0, 0, 0]));
      view.editor.insertBreak();
    });
    expect(view.editor.children).toEqual([paragraph("")]);
  } finally {
    await view.dispose();
  }
});

it("列表折叠保留图标与内容，Slate DOM 引用有效，只读不改文档", async () => {
  const value: Descendant[] = [
    {
      type: "bulleted-list",
      children: [
        {
          type: "list-item",
          icon: "⭐",
          iconType: "emoji",
          children: [paragraph("正文"), paragraph("详情")],
        },
      ],
    },
  ];
  const view = await mount(value);
  try {
    const item = Node.get(view.editor, [0, 0]) as ListItemElement;
    expect(ReactEditor.toDOMNode(view.editor, item).tagName).toBe("LI");
    await act(async () =>
      (view.host.querySelector("[data-list-fold-reveal]") as HTMLElement).click()
    );
    expect(Node.get(view.editor, [0, 0])).toMatchObject({
      icon: "⭐",
      isFold: true,
      allContent: item.children,
    });
    await act(async () =>
      (view.host.querySelector("[data-list-fold-reveal]") as HTMLElement).click()
    );
    expect(Node.get(view.editor, [0, 0])).toMatchObject({
      icon: "⭐",
      isFold: false,
      children: item.children,
    });
  } finally {
    await view.dispose();
  }
  const reader = await mount(value, true);
  try {
    const before = JSON.stringify(reader.editor.children);
    await act(async () =>
      (reader.host.querySelector("[data-list-fold-reveal]") as HTMLElement).click()
    );
    expect(JSON.stringify(reader.editor.children)).toBe(before);
  } finally {
    await reader.dispose();
  }
});

it("任务勾选可编辑时写入，只读时不改数据或显示勾选标记", async () => {
  const value: Descendant[] = [
    {
      type: "check-list",
      children: [
        {
          type: "check-list-item",
          checked: false,
          children: [paragraph("任务")],
        },
      ],
    },
  ];
  for (const readonly of [false, true]) {
    const view = await mount(value, readonly);
    try {
      const checkbox = view.host.querySelector("[data-check-list-item] svg")?.parentElement;
      expect(checkbox).toBeTruthy();
      await act(async () => checkbox?.click());
      expect(Node.get(view.editor, [0, 0])).toMatchObject({ checked: !readonly });
      expect(checkbox?.querySelector("path") !== null).toBe(!readonly);
    } finally {
      await view.dispose();
    }
  }
});
