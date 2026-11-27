import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import Board from "../../../Board";
import { BoardContext } from "../../../context";
import type { AudioElement as AudioNode } from "../../../types";
import AudioElement from "../index";
it("空名音频换语保留原节点和真实audio元素/播放数值，不重新取源或写标题", async () => {
  const element: AudioNode = {
    id: "audio",
    type: "audio",
    src: "file:///",
    x: 0,
    y: 0,
    width: 300,
    height: 72,
    resizable: false,
  };
  const board = new Board(
    [element],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  const source = createLocaleStore("zh-CN"),
    runtime = createI18nRuntime({ localeSource: source });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <BoardContext value={board}>
            <svg>
              <AudioElement element={element} onResize={() => undefined} />
            </svg>
          </BoardContext>
        </I18nRuntimeProvider>
      )
    );
    const audio = host.querySelector("audio");
    if (!audio) throw new Error("missing actual audio");
    await act(async () => {
      audio.currentTime = 12.5;
      audio.volume = 0.4;
      audio.playbackRate = 1.25;
      audio.dispatchEvent(new Event("timeupdate"));
    });
    const original = JSON.stringify(board.children);
    const originalLabel = host.textContent;
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => source.setLocale(locale));
      expect(host.querySelector("audio")).toBe(audio);
      expect(host.textContent).not.toBe(originalLabel);
      expect([audio.currentTime, audio.volume, audio.playbackRate]).toEqual([12.5, 0.4, 1.25]);
      expect(audio.getAttribute("src")).toBe("file:///");
      expect(JSON.stringify(board.children)).toBe(original);
      expect(element.title).toBeUndefined();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
    board.destroy();
  }
});
