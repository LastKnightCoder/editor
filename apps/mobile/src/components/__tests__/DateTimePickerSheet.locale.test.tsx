import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DateTimePickerSheet } from "../DateTimePickerSheet";
import { dateTimePickerMessages, useDateTimePickerI18n } from "../DateTimePickerSheet.i18n";
import { mobileI18n, mobileLocaleSource } from "../../services/i18n";
it("语言切换保留月份与五分钟步进草稿，确认前不提交且周一仍在首列", async () => {
  const original = mobileLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const confirm = vi.fn(),
    close = vi.fn();
  const value = new Date(2026, 0, 31, 23, 58).getTime();
  const Harness = () => {
    const { t } = useDateTimePickerI18n();
    return (
      <DateTimePickerSheet
        open
        title={t("confirm")}
        value={value}
        onConfirm={confirm}
        onClose={close}
      />
    );
  };
  const t = mobileI18n.get(dateTimePickerMessages).t;
  try {
    await act(async () => root.render(<Harness />));
    const action = (label: string) =>
      document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    await act(async () => {
      action(t("month.next"))?.click();
      action(t("time.plusMinutes", { count: 5 }))?.click();
      action(t("time.minusHour"))?.click();
    });
    const selected = [
      ...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]'),
    ].find(button => button.textContent === "28");
    if (!selected) throw new Error("月底草稿未保留");
    const grid = selected.parentElement;
    if (!grid) throw new Error("月历未挂载");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(selected.isConnected).toBe(true);
      expect(selected.getAttribute("aria-pressed")).toBe("true");
      expect(grid.firstElementChild?.textContent).toBe(
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2023, 0, 2))
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
    const done = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("confirm")
    );
    if (!done) throw new Error("确认入口未挂载");
    await act(async () => done.click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith(new Date(2026, 1, 28, 22, 3).getTime());
  } finally {
    await act(async () => root.unmount());
    host.remove();
    mobileLocaleSource.setLocale(original);
  }
});
