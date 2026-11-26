import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { TodoGroup } from "@/types";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { QuickAddBar } from "../components/QuickAddBar";

it.each([
  {
    text: "明天 17:00 原始任务 #工作",
    expected: {
      title: "原始任务",
      type: "deadline",
      dueAt: new Date(2026, 10, 27, 17).getTime(),
      groupId: 7,
      schedule: null,
    },
  },
  {
    text: "每周四、一 原始任务 #工作",
    expected: {
      title: "原始任务",
      type: "recurring",
      dueAt: null,
      groupId: 7,
      schedule: null,
      recurrence: { type: "weekly", weekdays: [4, 1] },
    },
  },
])("$text 切换预览语言保留输入和目标项目，回车提交原始解析结果", async ({ text, expected }) => {
  const initialLocale = desktopLocaleSource.getSnapshot();
  const now = new Date(2026, 10, 26, 12).getTime();
  const groups: TodoGroup[] = [
    {
      id: 7,
      title: "工作",
      color: "blue",
      sortIndex: 0,
      isArchived: false,
      isSystem: false,
      systemType: null,
      createTime: now,
      updateTime: now,
    },
  ];
  const onSubmit = vi.fn(async () => undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<QuickAddBar groups={groups} fallbackGroupId={7} now={now} onSubmit={onSubmit} />)
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("快速添加输入未挂载");
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("input setter missing");
      setter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.setSelectionRange(2, 5);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe(text);
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
      expect(host.textContent).toContain("原始任务");
      expect(host.textContent).toContain("工作");
      expect(onSubmit).not.toHaveBeenCalled();
    }
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    );
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(expected), 7);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(initialLocale);
  }
});
