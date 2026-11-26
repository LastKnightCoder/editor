import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createHeaderExtension } from "../../../../extensions/header/src";
import { editorMessages } from "../../../../i18n-runtime";
import useBlockPanelStore from "../../../stores/useBlockPanelStore";

it("语言切换保留块面板树、查询、子级选择和编辑器", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const locale = createLocaleStore("zh-CN"),
    runtime = createI18nRuntime({ localeSource: locale });
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({ extensions: [createHeaderExtension()] });
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <DndProvider backend={HTML5Backend}>
            <Editor
              ref={ref}
              kit={kit}
              readonly={false}
              initValue={[
                { type: "paragraph", children: [{ type: "formatted", text: "原始正文" }] },
              ]}
            />
          </DndProvider>
        </I18nRuntimeProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    await act(async () =>
      useBlockPanelStore.setState({
        blockPanelVisible: true,
        ownerEditor: editor,
        inputValue: "/",
        position: { x: 0, y: 0 },
      })
    );
    const list = useBlockPanelStore.getState().list;
    const groupIndex = list.findIndex(item =>
      item.children?.some(child => child.keywords.includes("h2"))
    );
    if (groupIndex < 0) throw new Error("标题子菜单不存在");
    await act(async () => useBlockPanelStore.getState().setActivePath([groupIndex, 1]));
    const selected = useBlockPanelStore.getState().getActiveItem();
    const before = JSON.stringify(editor.children);
    const findButton = () =>
      [...document.querySelectorAll("button")].find(
        button => button.textContent === runtime.get(editorMessages).t("block.heading2")
      );
    const button = findButton();
    if (!button) throw new Error("子菜单未打开");
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(findButton()).toBe(button);
      expect(useBlockPanelStore.getState().list).toBe(list);
      expect(useBlockPanelStore.getState().activePath).toEqual([groupIndex, 1]);
      expect(useBlockPanelStore.getState().getActiveItem()).toBe(selected);
      expect(useBlockPanelStore.getState().inputValue).toBe("/");
      expect(ref.current?.getEditor()).toBe(editor);
      expect(JSON.stringify(editor.children)).toBe(before);
    }
    await act(async () => useBlockPanelStore.getState().filterList("/標題2", list));
    expect(useBlockPanelStore.getState().list).toContain(selected);
  } finally {
    await act(async () => {
      root.unmount();
      useBlockPanelStore.getState().reset();
    });
    host.remove();
    runtime.dispose();
  }
});
