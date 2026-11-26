import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { treeMessages } from "../../../tree-i18n";
import Sidebar from "..";
import Whiteboard from "../../../Whiteboard";
import type Board from "../../../Board";
import { useBoard } from "../../../hooks/useBoard";
import { createGeometryExtension, createInteractionExtension } from "../../../extensions/builtins";
import { defineWhiteboardExtension } from "../../../extensions/api";
import type { BoardElement } from "../../../types";

it("同一自定义面板标题换语保留子树、草稿、焦点和选区", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(treeMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let mounts = 0,
    unmounts = 0;
  function Panel() {
    useEffect(() => {
      mounts++;
      return () => {
        unmounts++;
      };
    }, []);
    return <input defaultValue="作者默认值" />;
  }
  const render = () =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <Sidebar
          outline={{
            open: true,
            width: 260,
            onWidthChange: () => undefined,
            panel: { id: "author.panel", label: t("tree.outline"), content: <Panel /> },
          }}
        />
      </I18nRuntimeProvider>
    );
  try {
    await act(async () => render());
    const input = host.querySelector("input");
    if (!input) throw new Error("作者面板未挂载");
    input.value = "用户草稿";
    input.focus();
    input.setSelectionRange(1, 3);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        source.setLocale(locale);
        render();
      });
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe("用户草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(mounts).toBe(1);
      expect(unmounts).toBe(0);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
  }
});

it("元素树换语保留查询与重命名草稿，确认前不写画布", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
    }
  );
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(treeMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let board: Board | undefined;
  function Capture() {
    board = useBoard();
    return null;
  }
  const changes = vi.fn();
  const element = {
    id: "g",
    type: "geometry",
    name: "用户原名",
    geometryType: "rectangle",
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    paths: [],
    text: { align: "center", content: [] },
  } as unknown as BoardElement;
  const extensions = [
    createInteractionExtension(),
    createGeometryExtension(),
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
      }),
    }),
  ];
  const type = (input: HTMLInputElement, value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("原生输入 setter 不存在");
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <DndProvider backend={HTML5Backend}>
            <Whiteboard
              initData={[element]}
              extensions={extensions}
              showSidebar
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
              onChange={changes}
            />
          </DndProvider>
        </I18nRuntimeProvider>
      )
    );
    if (!board) throw new Error("画布未挂载");
    const search = host.querySelector<HTMLInputElement>(`input[placeholder="${t("tree.search")}"]`);
    if (!search) throw new Error("元素查询未挂载");
    await act(async () => type(search, "用户"));
    const name = [...host.querySelectorAll("span")].find(span => span.textContent === "用户原名");
    if (!name) throw new Error("元素行未挂载");
    await act(async () => name.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const input = [...host.querySelectorAll("input")].find(item => item !== search);
    if (!input) throw new Error("重命名输入未挂载");
    await act(async () => type(input, "用户草稿"));
    input.setSelectionRange(1, 3);
    const children = board.children,
      selection = board.selection,
      installed = board.extensions;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(host.querySelector(`input[placeholder="${t("tree.search")}"]`)).toBe(search);
      expect(search.value).toBe("用户");
      expect([...host.querySelectorAll("input")].find(item => item !== search)).toBe(input);
      expect(input.value).toBe("用户草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(board.children).toBe(children);
      expect(board.selection).toBe(selection);
      expect(board.extensions).toBe(installed);
      expect(changes).not.toHaveBeenCalled();
    }
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    );
    expect(board.children.find(item => item.id === "g")?.name).toBe("用户草稿");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
    vi.unstubAllGlobals();
  }
});
