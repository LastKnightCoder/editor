import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { Composer } from "../components/Composer";
import { diaryMessages } from "../i18n";

it("切换语言保留输入条正文、标签、焦点和选区，不发布草稿", async () => {
  const initialLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSubmit = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Composer
          now={new Date(2026, 10, 26, 12).getTime()}
          tags={[{ name: "读书/原始标签", color: "blue", sort: 0 }]}
          counts={new Map()}
          scopeTag="读书/原始标签"
          onSubmit={onSubmit}
          onRecolor={vi.fn()}
          onClearTag={vi.fn()}
        />
      )
    );
    const input = host.querySelector("textarea");
    if (!input) throw new Error("输入条未挂载");
    await act(async () => input.focus());
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("textarea value setter missing");
      setter.call(input, "尚未发布的繁體 diary draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.setSelectionRange(2, 6);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("textarea")).toBe(input);
      expect(input.value).toBe("尚未发布的繁體 diary draft");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
      expect(input.getAttribute("aria-label")).toBe(
        desktopI18n.get(diaryMessages).t("composer.input")
      );
      expect(host.textContent).toContain("读书/原始标签");
      expect(onSubmit).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(initialLocale);
  }
});
