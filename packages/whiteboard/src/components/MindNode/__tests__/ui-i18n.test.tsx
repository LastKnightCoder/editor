import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import type { Descendant } from "slate";
import { nodeMessages } from "../../../nodes-i18n";
import { TextExtensionContext, embeddedTextOptions } from "../../../extensions/text";
import { NotePeek } from "../NotePeek";
import { MindRanges, EDIT_BOUNDARY_EVENT } from "../MindRanges";
import Board from "../../../Board";
import { MindUtil } from "../../../utils/MindUtil";
import { buildMindRootElement } from "../../../extensions/creators/mind";
import { DEFAULT_PAGE_SKETCH } from "../../../types";
import { resolveSketch } from "../../../utils/sketch";

it("笔记预览换语保留打开状态与原文订阅，不重新读取或丢失摘要", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(nodeMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let reads = 0,
    closes = 0;
  const content: Descendant[] = [
    { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    { type: "paragraph", children: [{ type: "formatted", text: "用户原文摘要" }] },
  ];
  function Observer({
    contentId,
    onChange,
  }: {
    contentId: number;
    onChange(value: Descendant[]): void;
  }) {
    useEffect(() => {
      reads++;
      onChange(content);
      return () => {
        closes++;
      };
    }, [contentId, onChange]);
    return null;
  }
  const open = vi.fn();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <TextExtensionContext value={{ ...embeddedTextOptions, Observer }}>
            <NotePeek contentId={7} title="" color="currentColor" style={{}} onOpen={open} />
          </TextExtensionContext>
        </I18nRuntimeProvider>
      )
    );
    const trigger = host.querySelector("button");
    if (!trigger) throw new Error("笔记预览入口未挂载");
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(280);
    });
    expect(reads).toBe(1);
    expect(document.body.textContent).toContain("用户原文摘要");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(host.querySelector("button")).toBe(trigger);
      expect(trigger.getAttribute("aria-label")).toBe(
        t("nodes.note.openLabel", { title: t("nodes.note.untitled") })
      );
      expect(document.body.textContent).toContain("用户原文摘要");
      expect(reads).toBe(1);
      expect(closes).toBe(0);
      expect(open).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
    vi.useRealTimers();
  }
});

it("外框标题编辑换语保留同一输入、选区与原边界，失焦才提交用户标题", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(nodeMessages);
  const mind = buildMindRootElement(0, 0, 13);
  mind.children = MindUtil.nodesFromOutline(
    ["用户甲", "用户乙"].map(text => ({
      text: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
      children: [],
    }))
  );
  const [first, last] = mind.children;
  mind.boundaries = [{ id: "boundary", startId: first.id, endId: last.id, title: "原始外框" }];
  const board = new Board(
    [mind],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ranges = {
    braces: [],
    boundaries: [
      {
        id: "boundary",
        startId: first.id,
        title: "原始外框",
        box: { x: 0, y: 0, width: 200, height: 80 },
      },
    ],
  };
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <svg>
            <MindRanges
              board={board}
              rootId={mind.id}
              ranges={ranges}
              lineOf={() => ({
                lineColor: "currentColor",
                lineWidth: 1,
                textColor: "currentColor",
              })}
              dark={false}
              sketch={resolveSketch(DEFAULT_PAGE_SKETCH, mind)}
            />
          </svg>
        </I18nRuntimeProvider>
      )
    );
    await act(async () => board.emit(EDIT_BOUNDARY_EVENT, "boundary"));
    const input = host.querySelector("input");
    if (!input) throw new Error("外框标题未进入编辑");
    input.value = "用户外框草稿";
    input.focus();
    input.setSelectionRange(1, 4);
    const original = board.children;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(host.querySelector(`input[placeholder="${t("nodes.mind.boundaryTitle")}"]`)).toBe(
        input
      );
      expect(input.value).toBe("用户外框草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
      expect(board.children).toBe(original);
    }
    await act(async () => input.blur());
    expect(
      (board.children[0] as typeof mind).boundaries?.find(boundary => boundary.id === "boundary")
        ?.title
    ).toBe("用户外框草稿");
  } finally {
    await act(async () => root.unmount());
    board.destroy();
    host.remove();
    runtime.dispose();
  }
});
