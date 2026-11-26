import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { ToastHost, toast } from "@tau/ui";
import Whiteboard from "../../Whiteboard";
import Board from "../../Board";
import type { ImageElement } from "../../types";
import { useBoard } from "../../hooks/useBoard";
import { BOARD_TO_CONTAINER } from "../../constants/map";
import {
  createImageExtension,
  createImagePreviewExtension,
  createInteractionExtension,
} from "../../extensions/builtins";
import { defineWhiteboardExtension } from "../../extensions/api";
import { browserMediaInfo } from "../../extensions/media";
import { ImagePlugin } from "../ImagePlugin";
import { FileDragDropPlugin } from "../FileDragDropPlugin";
import { bindWhiteboardI18n } from "../../i18n-runtime";
import { uiMessages } from "../../ui-i18n";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };

async function previewFixture(description: string) {
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
  const { t } = runtime.get(uiMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let captured: Board | undefined;
  const loads: string[] = [];
  function Capture() {
    captured = useBoard();
    return null;
  }
  function ResourceImage({ url, ...props }: { url: string; alt?: string; className?: string }) {
    useEffect(() => {
      loads.push(url);
    }, [url]);
    return <img src={url} {...props} />;
  }
  const element = {
    id: "image",
    type: "image",
    src: "resource://original-image",
    description,
    x: 10,
    y: 10,
    width: 100,
    height: 80,
    naturalWidth: 100,
    naturalHeight: 80,
  } as ImageElement;
  const extensions = [
    createInteractionExtension(),
    createImageExtension({ Image: ResourceImage }),
    createImagePreviewExtension({ Image: ResourceImage }),
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
      }),
    }),
  ];
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
  });
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <Whiteboard
          initData={[element]}
          initSelection={{ selectedElements: [element], selectArea: null }}
          initViewPort={viewport}
          extensions={extensions}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      </I18nRuntimeProvider>
    )
  );
  if (!captured) throw new Error("图片画布未挂载");
  const board = captured;
  const plugin = board.getPlugin<ImagePlugin>("image");
  if (!plugin) throw new Error("内置图片插件未安装");
  const event = new MouseEvent("pointerdown", {
    button: 0,
    clientX: 20,
    clientY: 20,
  }) as PointerEvent;
  await act(async () => {
    plugin.onPointerDown(event, board);
    plugin.onGlobalPointerUp(event, board);
  });
  const close = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${t("ui.preview.close")}"]`
  );
  const modal = close?.parentElement;
  const image = modal?.querySelector("img");
  if (!close || !modal || !image) throw new Error("真实预览事件未打开图片");
  return { board, source, runtime, t, close, modal, image, loads };
}

it("真实预览事件的默认说明随语言更新，图片、任务和画布数据保持同一实例", async () => {
  const fixture = await previewFixture("");
  const { board, source, t, close, modal, image, loads } = fixture;
  const children = board.children,
    installed = board.extensions;
  const readCount = loads.length,
    initialCaption = modal.textContent;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(document.querySelector(`button[aria-label="${t("ui.preview.close")}"]`)).toBe(close);
    expect(modal.querySelector("img")).toBe(image);
    expect(image.getAttribute("src")).toBe("resource://original-image");
    expect(loads.length).toBe(readCount);
    expect(board.children).toBe(children);
    expect(board.extensions).toBe(installed);
    expect(board.children[0].description).toBe("");
  }
  expect(modal.textContent).not.toBe(initialCaption);
});

it("用户说明与系统默认词同名时仍保留原文", async () => {
  const { board, source, modal, image, loads } = await previewFixture("图片");
  const readCount = loads.length;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(modal.querySelector("img")).toBe(image);
    expect(image.alt).toBe("图片");
    expect(modal.textContent).toBe("图片");
    expect(loads.length).toBe(readCount);
    expect(board.children[0].description).toBe("图片");
  }
});

it("拖放上传等待中换语只刷新原Toast，不重复读取或上传，完成后沿原任务插入", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const board = new Board([], viewport, { selectedElements: [], selectArea: null });
  BOARD_TO_CONTAINER.set(board, host);
  bindWhiteboardI18n(board, runtime);
  let finish: (url: string) => void = () => undefined;
  const pending = new Promise<string>(resolve => {
    finish = resolve;
  });
  const upload = vi.fn(() => pending),
    imageInfo = vi.fn(async () => ({ width: 100, height: 80 }));
  const show = vi.spyOn(toast, "show"),
    dismiss = vi.spyOn(toast, "dismiss");
  const plugin = new FileDragDropPlugin({ ...browserMediaInfo, upload, imageInfo });
  const file = new File(["image"], "用户图片.png", { type: "image/png" });
  const event = {
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    clientX: 20,
    clientY: 20,
    dataTransfer: { files: [file] },
  } as unknown as DragEvent;
  cleanups.push(async () => {
    finish("resource://uploaded");
    await act(async () => {
      for (const result of show.mock.results)
        if (typeof result.value === "number") toast.dismiss(result.value);
      root.unmount();
    });
    board.destroy();
    BOARD_TO_CONTAINER.delete(board);
    host.remove();
    runtime.dispose();
  });
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <ToastHost />
      </I18nRuntimeProvider>
    )
  );
  await act(async () => {
    plugin.onDrop(event, board);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  });
  const status = host.querySelector('[role="status"]');
  if (!status) throw new Error("上传提示未挂载");
  const initialText = status.textContent;
  const loadingIndex = show.mock.calls.findIndex(call => call[0] === "loading");
  const loadingId = show.mock.results[loadingIndex].value;
  const shown = show.mock.calls.length;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(host.querySelector('[role="status"]')).toBe(status);
    expect(show.mock.calls.length).toBe(shown);
    expect(upload).toHaveBeenCalledExactlyOnceWith(file);
    expect(imageInfo).toHaveBeenCalledExactlyOnceWith(file);
    expect(board.children).toEqual([]);
  }
  expect(status.textContent).not.toBe(initialText);
  await act(async () => {
    finish("resource://uploaded");
    await vi.waitFor(() =>
      expect(board.children.map(element => [element.type, element.src])).toEqual([
        ["image", "resource://uploaded"],
      ])
    );
  });
  expect(dismiss).toHaveBeenCalledWith(loadingId);
  expect(file.name).toBe("用户图片.png");
});
