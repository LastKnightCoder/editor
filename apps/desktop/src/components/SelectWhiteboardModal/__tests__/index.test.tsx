import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { whiteboardMessages } from "@/features/whiteboards/i18n";
import type { Whiteboard } from "@/types";
import SelectWhiteboardModal from "..";

it("选择器换语保留搜索和勾选，进行中的确认保持同一任务", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const scrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => {
    finish = resolve;
  });
  const confirm = vi.fn<(boards: Whiteboard[]) => Promise<void>>().mockReturnValue(pending);
  const cancel = vi.fn();
  const boards = [
    {
      id: 1,
      title: "用户白板甲",
      description: "",
      tags: ["原标签"],
      updateTime: 100,
      createTime: 100,
      whiteboardContentList: [],
    },
    {
      id: 2,
      title: "其他",
      description: "",
      tags: [],
      updateTime: 200,
      createTime: 100,
      whiteboardContentList: [],
    },
  ] as unknown as Whiteboard[];
  function Form() {
    const [selected, setSelected] = useState<Whiteboard[]>([]);
    return (
      <SelectWhiteboardModal
        open
        multiple
        allWhiteboards={boards}
        selectedWhiteboards={selected}
        onChange={setSelected}
        onOk={confirm}
        onCancel={cancel}
      />
    );
  }
  const { t } = desktopI18n.get(whiteboardMessages);
  try {
    await act(async () => root.render(<Form />));
    const input = document.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("搜索输入未挂载");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setValue) throw new Error("搜索字段缺少原生 setter");
      setValue.call(input, "用户");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const option = document.querySelector<HTMLButtonElement>('[role="option"]');
    if (!option) throw new Error("白板选项未挂载");
    await act(async () => option.click());
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("用户");
    expect(document.querySelector('[role="option"][aria-selected="true"]')).toBe(option);
    expect(confirm).not.toHaveBeenCalled();
    const button = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("confirm")
    );
    if (!button) throw new Error("确认按钮未挂载");
    await act(async () => button.click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith([boards[0]]);
    expect(option.disabled).toBe(true);
    await act(async () => desktopLocaleSource.setLocale("en-US"));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("用户");
    expect(document.querySelector('[role="option"][aria-selected="true"]')).toBe(option);
    expect(option.disabled).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(option.disabled).toBe(false);
  } finally {
    finish();
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(original);
    HTMLElement.prototype.scrollTo = scrollTo;
  }
});
