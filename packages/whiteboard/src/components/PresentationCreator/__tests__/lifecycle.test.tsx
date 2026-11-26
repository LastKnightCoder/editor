import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import Whiteboard from "../../../Whiteboard";
import type Board from "../../../Board";
import type { BoardElement } from "../../../types";
import { BOARD_TO_CONTAINER } from "../../../constants/map";
import { useBoard } from "../../../hooks/useBoard";
import { defineWhiteboardExtension } from "../../../extensions/api";
import {
  createGeometryExtension,
  createInteractionExtension,
  createPresentationExtension,
} from "../../../extensions/builtins";
import { presentationMessages } from "../../../presentation-i18n";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount() {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "Date",
      "performance",
    ],
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
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(presentationMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let captured: Board | undefined;
  function Capture() {
    captured = useBoard();
    return null;
  }
  const elements = ["first", "second"].map((id, index) => ({
    id,
    type: "geometry",
    name: "用户图形",
    geometryType: "rectangle",
    x: index * 200,
    y: 10,
    width: 100,
    height: 100,
    paths: [],
    text: { align: "center", content: [] },
  })) as unknown as BoardElement[];
  const extensions = [
    createInteractionExtension(),
    createGeometryExtension(),
    createPresentationExtension(),
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
          initData={elements}
          initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
          extensions={extensions}
          showToolbar={false}
          showAttributeSetter={false}
        />
      </I18nRuntimeProvider>
    )
  );
  if (!captured) throw new Error("画布未挂载");
  const board = captured;
  const canvas = BOARD_TO_CONTAINER.get(board);
  if (!canvas) throw new Error("画布容器未挂载");
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  const button = (text: string) => {
    const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.getAttribute("aria-label") === text || item.textContent === text
    );
    if (!result) throw new Error("演示动作未挂载: " + text);
    return result;
  };
  return { board, source, runtime, host, canvas, t, button };
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setValue) throw new Error("原生输入 setter 不存在");
  setValue.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("创建时换语保留序列名、帧和正在调整的视口，保存只提交原始数据", async () => {
  const { board, source, host, t, button } = await mount();
  await act(async () => board.presentationManager.startCreatingSequence());
  await act(async () =>
    board.apply({
      type: "set_selection",
      properties: board.selection,
      newProperties: { selectedElements: [board.children[0]], selectArea: null },
    })
  );
  await act(async () => button(t("presentation.add")).click());
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="${t("presentation.name")}"]`
  );
  if (!input) throw new Error("序列名称未挂载");
  await act(async () => {
    input.focus();
    type(input, "用户序列草稿");
  });
  input.setSelectionRange(1, 4);
  const row = host.querySelector('[role="button"][aria-current="true"]');
  if (!row) throw new Error("已添加的帧未挂载");
  const installed = board.extensions;
  const children = board.children;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => source.setLocale(locale));
    expect(host.querySelector(`input[aria-label="${t("presentation.name")}"]`)).toBe(input);
    expect(input.value).toBe("用户序列草稿");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(host.querySelector('[role="button"][aria-current="true"]')).toBe(row);
    expect(board.presentationManager.isCreatingSequence).toBe(true);
    expect(board.presentationManager.sequences).toEqual([]);
    expect(board.children).toBe(children);
    expect(board.extensions).toBe(installed);
  }
  await act(async () => button(t("presentation.adjust")).click());
  const slider = host.querySelector<HTMLInputElement>(
    `input[aria-label="${t("presentation.padding")}"]`
  );
  if (!slider) throw new Error("视口调整未开始");
  await act(async () => type(slider, "75"));
  const viewport = board.viewPort;
  await act(async () => source.setLocale("zh-CN"));
  expect(host.querySelector(`input[aria-label="${t("presentation.padding")}"]`)).toBe(slider);
  expect(slider.value).toBe("75");
  expect(board.viewPort).toBe(viewport);
  expect(button(t("presentation.save")).disabled).toBe(true);
  expect(board.presentationManager.sequences).toEqual([]);
  await act(async () => button(t("presentation.done")).click());
  await act(async () => button(t("presentation.save")).click());
  expect(
    board.presentationManager.sequences.map(sequence => ({
      name: sequence.name,
      elements: sequence.frames.map(frame => frame.elements),
    }))
  ).toEqual([{ name: "用户序列草稿", elements: [["first"]] }]);
});

it("放映中换语保留当前帧和激光模式，不重进全屏或重置提示计时", async () => {
  const { board, source, host, canvas, t, button } = await mount();
  const fullscreen = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(canvas, "requestFullscreen", { value: fullscreen });
  let sequence: ReturnType<typeof board.presentationManager.addSequence> | undefined;
  await act(async () => {
    sequence = board.presentationManager.addSequence("用户演示", [
      { id: "frame-one", elements: ["first"] },
      { id: "frame-two", elements: ["second"] },
    ]);
  });
  if (!sequence) throw new Error("演示序列未创建");
  const activeSequence = sequence;
  await act(async () => board.presentationManager.startPresentationMode(activeSequence.id));
  await act(async () => button(t("presentation.next")).click());
  await act(async () => vi.advanceTimersByTime(600));
  const laser = button(t("presentation.laser"));
  await act(async () => laser.click());
  const hint = [...host.querySelectorAll("div")].find(
    item => !item.children.length && item.textContent?.trim() === t("presentation.navigationHint")
  );
  if (!hint) throw new Error("放映提示未挂载");
  const installed = board.extensions;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => {
      source.setLocale(locale);
      vi.advanceTimersByTime(900);
    });
    expect(board.presentationManager.currentFrameIndex).toBe(1);
    expect(board.presentationManager.currentSequence?.id).toBe(activeSequence.id);
    expect(board.presentationManager.isPresentationMode).toBe(true);
    expect(board.presentationManager.currentSequence?.frames).toBe(activeSequence.frames);
    expect(button(t("presentation.cursor"))).toBe(laser);
    expect(laser.getAttribute("aria-pressed")).toBe("true");
    expect(fullscreen).toHaveBeenCalledTimes(1);
    expect(board.extensions).toBe(installed);
    expect(host.contains(hint)).toBe(true);
  }
  await act(async () => vi.advanceTimersByTime(601));
  expect(host.contains(hint)).toBe(false);
  expect(board.presentationManager.sequences.map(item => item.name)).toEqual(["用户演示"]);
});
