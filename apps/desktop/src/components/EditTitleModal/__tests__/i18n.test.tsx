import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import EditTitleModal from "../index";
import { titleEditorMessages } from "../i18n";

it("切换语言保留重命名草稿、输入节点和选区，不确认修改", async () => {
  const initialLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onConfirm = vi.fn();
  try {
    await act(async () =>
      root.render(
        <EditTitleModal open initialTitle="原始文档" onCancel={vi.fn()} onConfirm={onConfirm} />
      )
    );
    const input = document.querySelector("textarea");
    if (!input) throw new Error("重命名输入未挂载");
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) throw new Error("textarea setter missing");
      setter.call(input, "尚未提交的繁體 title");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.setSelectionRange(2, 6);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector("textarea")).toBe(input);
      expect(input.value).toBe("尚未提交的繁體 title");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
      expect(input.placeholder).toBe(desktopI18n.get(titleEditorMessages).t("placeholder"));
      expect(onConfirm).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(initialLocale);
  }
});
