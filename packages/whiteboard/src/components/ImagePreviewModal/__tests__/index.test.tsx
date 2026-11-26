import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import ImagePreviewModal from "..";
import { uiMessages } from "../../../ui-i18n";

it("预览换语保留同一图片资源和作者描述，显式空描述保持为空", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(uiMessages);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  const src = "https://media.example.test/image.png";
  const render = (alt: string) =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <ImagePreviewModal open src={src} alt={alt} onClose={close} />
      </I18nRuntimeProvider>
    );
  try {
    await act(async () => render("作者自定义描述"));
    const image = document.querySelector("img");
    if (!image) throw new Error("图片预览未挂载");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(document.querySelector("img")).toBe(image);
      expect(image.getAttribute("src")).toBe(src);
      expect(image.alt).toBe("作者自定义描述");
      expect(close).not.toHaveBeenCalled();
    }
    await act(async () => render(""));
    expect(document.querySelector("img")).toBe(image);
    expect(image.alt).toBe("");
    const button = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${t("ui.preview.close")}"]`
    );
    if (!button) throw new Error("关闭预览动作未挂载");
    await act(async () => button.click());
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
  }
});
