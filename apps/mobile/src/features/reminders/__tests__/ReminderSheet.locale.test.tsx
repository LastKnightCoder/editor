import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReminderSheet } from "../ReminderSheet";
import { useReminderSheetI18n, reminderSheetMessages } from "../ReminderSheet.i18n";
import { mobileI18n, mobileLocaleSource } from "../../../services/i18n";
import { reminderLabel } from "@tau/shared/reminders";
import { notifyPermissionState, notifyRequestPermission, notifySchedule } from "../native";
vi.mock("../native", async importOriginal => ({
  ...(await importOriginal<typeof import("../native")>()),
  isNativeNotifyAvailable: () => true,
  notifyPermissionState: vi.fn(async () => ({
    notifications: "prompt",
    exactAlarm: "granted",
    pending: 0,
  })),
  notifyRequestPermission: vi.fn(),
  notifySchedule: vi.fn(),
}));
it("切换语言保留挂起的提醒草稿与权限说明，不请求授权或重排通知", async () => {
  const original = mobileLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(),
    close = vi.fn();
  const Harness = () => {
    useReminderSheetI18n();
    return (
      <ReminderSheet
        open
        value={[]}
        anchor={new Date(2026, 10, 26, 18).getTime()}
        onChange={change}
        onClose={close}
      />
    );
  };
  const choice = (offset: number) =>
    [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(button =>
      button.textContent?.startsWith(
        reminderLabel(offset, false, { locale: mobileI18n.getSnapshot() })
      )
    );
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await vi.waitFor(() => expect(notifyPermissionState).toHaveBeenCalled());
    });
    const offsets = [300000, 900000, 1800000, 3600000];
    const first = choice(offsets[0]);
    if (!first) throw new Error("提醒选项未挂载");
    for (const offset of offsets) await act(async () => choice(offset)?.click());
    const permissionReads = vi.mocked(notifyPermissionState).mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(choice(offsets[0])).toBe(first);
      expect([...document.querySelectorAll('button[aria-pressed="true"]')]).toHaveLength(
        offsets.length
      );
      expect(document.body.textContent).toContain(
        mobileI18n.get(reminderSheetMessages).t("permission.explanation")
      );
      expect(vi.mocked(notifyPermissionState).mock.calls.length).toBe(permissionReads);
      expect(notifyRequestPermission).not.toHaveBeenCalled();
      expect(notifySchedule).not.toHaveBeenCalled();
      expect(change).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
    const done = [...document.querySelectorAll("button")].find(
      button => button.textContent === mobileI18n.get(reminderSheetMessages).t("sheet.done")
    );
    if (!done) throw new Error("完成入口未挂载");
    await act(async () => done.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(offsets);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    mobileLocaleSource.setLocale(original);
    vi.clearAllMocks();
  }
});
