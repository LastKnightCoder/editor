import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import Board from "../../Board";
import { BoardContext } from "../../context";
import MediaUrlDialog from "../MediaUrlDialog";
import { uiMessages } from "../../ui-i18n";

it("媒体插入等待图片解码时换语保留地址和同一任务，完成后只插入一次", async () => {
  const reads: { src: string; finish(): void }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      width = 640;
      height = 480;
      onload?: () => void;
      set src(src: string) {
        reads.push({ src, finish: () => this.onload?.() });
      }
    }
  );
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(uiMessages);
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  const address = "https://media.example.test/a.png?name=raw%2Bvalue#part";
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <BoardContext value={board}>
            <MediaUrlDialog modal={{ type: "image", action: "url" }} onClose={close} />
          </BoardContext>
        </I18nRuntimeProvider>
      )
    );
    const input = document.querySelector<HTMLInputElement>(
      `input[aria-label="${t("ui.media.url")}"]`
    );
    if (!input) throw new Error("媒体地址输入未挂载");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("原生输入 setter 不存在");
      setter.call(input, address);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const insert = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("ui.media.insert")
    );
    if (!insert) throw new Error("插入动作未挂载");
    await act(async () => insert.click());
    expect(reads.map(read => read.src)).toEqual([address]);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(document.querySelector(`input[aria-label="${t("ui.media.url")}"]`)).toBe(input);
      expect(input.value).toBe(address);
      expect(insert.disabled).toBe(true);
      expect(reads.map(read => read.src)).toEqual([address]);
      expect(board.children).toEqual([]);
      expect(close).not.toHaveBeenCalled();
    }
    await act(async () => reads[0].finish());
    expect(board.children.map(element => ({ type: element.type, src: element.src }))).toEqual([
      { type: "image", src: address },
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    board.destroy();
    host.remove();
    runtime.dispose();
    vi.unstubAllGlobals();
  }
});
