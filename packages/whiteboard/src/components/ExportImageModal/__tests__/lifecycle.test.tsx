import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { toast } from "@tau/ui";
import Whiteboard from "../../../Whiteboard";
import type Board from "../../../Board";
import type { BoardElement } from "../../../types";
import { useBoard } from "../../../hooks/useBoard";
import {
  createExportExtension,
  createGeometryExtension,
  createInteractionExtension,
} from "../../../extensions/builtins";
import { defineWhiteboardExtension } from "../../../extensions/api";
import { createExportFilename } from "../../../utils/ExportImageUtil";
import { imageExportMessages } from "../../../export-i18n";
import type { CaptureBlob } from "../../../hooks/useBoardCapture";

it("导出等待中换语保留配置、原截图任务和选择，完成后保存同一Blob并恢复选择", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "Date"],
  });
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
  const createObjectURL = vi.fn(() => "blob:export-original");
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    }
  );
  const downloads: { filename: string; href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloads.push({ filename: this.download, href: this.href });
  });
  const success = vi.spyOn(toast, "success");
  let finish: (blob: Blob) => void = () => undefined;
  const waiting = new Promise<Blob>(resolve => {
    finish = resolve;
  });
  const capture = vi.fn<CaptureBlob>(() => waiting);
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(imageExportMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let captured: Board | undefined;
  function Capture() {
    captured = useBoard();
    return null;
  }
  const known = {
    id: "known",
    type: "geometry",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    geometryType: "rectangle",
    paths: [],
    text: { align: "center", content: [] },
  } as BoardElement;
  const unknown = {
    id: "unknown",
    type: "author.missing",
    x: 150,
    y: 0,
    width: 40,
    height: 40,
    data: { text: "用户数据" },
  } as BoardElement;
  const originalSelection = { selectedElements: [known, unknown], selectArea: null };
  const extensions = [
    createInteractionExtension(),
    createGeometryExtension(),
    createExportExtension(capture),
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
      }),
    }),
  ];
  const button = (text: string) => {
    const item = [...document.querySelectorAll("button")].find(
      button => button.textContent === text
    );
    if (!item) throw new Error("导出动作未挂载: " + text);
    return item;
  };
  const input = (label: string) => {
    const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!field) throw new Error("导出字段未挂载: " + label);
    return field;
  };
  const change = (field: HTMLInputElement, value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("原生字段setter缺失");
    setValue.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <Whiteboard
            initData={[known, unknown]}
            initSelection={originalSelection}
            extensions={extensions}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
          />
        </I18nRuntimeProvider>
      )
    );
    if (!captured) throw new Error("画布未挂载");
    const board = captured;
    await act(async () =>
      board.emit("tau.modal.open", {
        type: "export-image",
        action: "selection",
        selectedElementIds: ["known", "unknown"],
      })
    );
    const transparent = document.querySelector<HTMLInputElement>('input[value="transparent"]');
    const placeholders = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!transparent || !placeholders) throw new Error("导出配置未挂载");
    const scale = input(t("imageExport.scale")),
      padding = input(t("imageExport.padding"));
    await act(async () => {
      transparent.click();
      placeholders.click();
      change(scale, "2.5");
      change(padding, "44");
    });
    const children = board.children,
      installed = board.extensions;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(input(t("imageExport.scale"))).toBe(scale);
      expect(input(t("imageExport.padding"))).toBe(padding);
      expect([scale.value, padding.value]).toEqual(["2.5", "44"]);
      expect(transparent.checked).toBe(true);
      expect(placeholders.checked).toBe(true);
      expect(capture).not.toHaveBeenCalled();
      expect(board.selection).toBe(originalSelection);
    }
    await act(async () => button(t("imageExport.export")).click());
    for (let frame = 0; frame < 20 && !capture.mock.calls.length; frame++)
      await act(async () => vi.advanceTimersToNextFrame());
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toMatchObject({ dpr: 2.5, type: "png" });
    const target = capture.mock.calls[0][0];
    expect(board.selection.selectedElements).toEqual([]);
    await act(async () => source.setLocale("zh-CN"));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toBe(target);
    expect(input(t("imageExport.scale"))).toBe(scale);
    expect(input(t("imageExport.padding"))).toBe(padding);
    expect([scale.value, padding.value]).toEqual(["2.5", "44"]);
    expect(transparent.checked).toBe(true);
    expect(placeholders.checked).toBe(true);
    expect(board.children).toBe(children);
    expect(board.extensions).toBe(installed);
    expect(downloads).toEqual([]);
    const blob = new Blob(["original image bytes"], { type: "image/png" });
    const filename = createExportFilename("selection");
    await act(async () => finish(blob));
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(downloads).toEqual([{ filename, href: "blob:export-original" }]);
    expect(board.selection.selectedElements).toEqual(originalSelection.selectedElements);
    expect(board.selection.selectArea ?? null).toBeNull();
  } finally {
    await act(async () => {
      for (const result of success.mock.results)
        if (typeof result.value === "number") toast.dismiss(result.value);
      root.unmount();
    });
    host.remove();
    runtime.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
