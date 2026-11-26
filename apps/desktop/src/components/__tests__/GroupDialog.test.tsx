import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { GroupDialog } from "../GroupDialog";
import { groupDialogMessages } from "../GroupDialog.i18n";

it("语言与相同分组的新对象不重置草稿，保存仍提交原色值", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const submit = vi
      .fn<(title: string, color: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    close = vi.fn();
  const saved = { id: 42, title: "原始名称", color: "blue" };
  const { t } = desktopI18n.get(groupDialogMessages);
  const render = async (open: boolean) =>
    act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <GroupDialog open={open} group={{ ...saved }} onSubmit={submit} onClose={close} />
        </I18nRuntimeProvider>
      )
    );
  const input = () => document.querySelector<HTMLInputElement>("input");
  const type = async (value: string) =>
    act(async () => {
      const field = input();
      if (!field) throw new Error("名称输入未挂载");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const choose = async () =>
    act(async () => {
      const choice = document.querySelector<HTMLButtonElement>('[role="radio"]');
      if (!choice) throw new Error("色板未挂载");
      choice.click();
    });
  const save = async () =>
    act(async () => {
      const button = [...document.querySelectorAll("button")].find(
        button => button.textContent === t("save")
      );
      if (!button) throw new Error("保存按钮未挂载");
      button.click();
    });
  try {
    await render(true);
    await choose();
    await type("baseline");
    await save();
    const originalColor = submit.mock.calls[0]?.[1];
    await render(false);
    await render(true);
    await choose();
    await type("用户草稿");
    const field = input();
    if (!field) throw new Error("名称输入未挂载");
    await act(async () => field.focus());
    field.setSelectionRange(1, 3);
    const selected = document.querySelector('[role="radio"][aria-checked="true"]');
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      await render(true);
      expect(input()).toBe(field);
      expect(field.value).toBe("用户草稿");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(document.querySelector('[role="radio"][aria-checked="true"]')).toBe(selected);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(saved.title).toBe("原始名称");
    }
    await save();
    expect(submit.mock.calls[1]).toEqual(["用户草稿", originalColor]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(original);
  }
});
