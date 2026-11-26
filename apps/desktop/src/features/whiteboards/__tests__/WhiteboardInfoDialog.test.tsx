import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { WhiteboardInfoDialog } from "../components/WhiteboardInfoDialog";
import { whiteboardMessages } from "../i18n";

it("切换语言保留信息表单的输入实例、草稿和选区，不提交或关闭", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn();
  const submit = vi.fn<(info: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const initial = { title: "原始标题", description: "原始描述", tags: ["原始标签"] };
  const { t } = desktopI18n.get(whiteboardMessages);
  const type = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) =>
    act(async () => {
      const prototype =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setValue) throw new Error("输入字段缺少原生 setter");
      setValue.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <WhiteboardInfoDialog
          open
          initial={initial}
          knownTags={["已有标签"]}
          onClose={close}
          onSubmit={submit}
        />
      )
    );
    const fields = [...document.querySelectorAll<HTMLInputElement>("input")];
    const title = fields[0],
      tagDraft = fields[1];
    const description = document.querySelector<HTMLTextAreaElement>("textarea");
    if (!title || !tagDraft || !description) throw new Error("信息表单未挂载");
    await type(title, "用户标题草稿");
    await type(description, "用户描述草稿");
    await type(tagDraft, "待确认标签");
    await act(async () => title.focus());
    title.setSelectionRange(1, 4);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect([...document.querySelectorAll("input")]).toEqual(fields);
      expect(document.querySelector("textarea")).toBe(description);
      expect([title.value, description.value, tagDraft.value]).toEqual([
        "用户标题草稿",
        "用户描述草稿",
        "待确认标签",
      ]);
      expect(document.activeElement).toBe(title);
      expect([title.selectionStart, title.selectionEnd]).toEqual([1, 4]);
      expect(submit).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
    const save = [...document.querySelectorAll("button")].find(
      button => button.textContent === t("save")
    );
    if (!save) throw new Error("保存按钮未挂载");
    await act(async () => save.click());
    expect(submit).toHaveBeenCalledExactlyOnceWith({
      title: "用户标题草稿",
      description: "用户描述草稿",
      tags: ["原始标签", "待确认标签"],
    });
    expect(initial).toEqual({ title: "原始标题", description: "原始描述", tags: ["原始标签"] });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(original);
  }
});
