import { act } from "react";
import { createRoot } from "react-dom/client";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { editorMessages } from "../../../../../i18n";
import CommentList from "../CommentList";

it("切换语言保留批注回复的草稿与焦点，确认后按原线程提交", async () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const locale = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: locale });
  const { t } = runtime.get(editorMessages);
  const reply = vi.fn();
  const edit = vi.fn();
  const remove = vi.fn();
  const comments = [
    { id: "thread-a", content: "原始批注", createTime: 1, updateTime: 1, replies: [] },
  ];
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <CommentList comments={comments} onReply={reply} onEdit={edit} onDelete={remove} />
        </I18nRuntimeProvider>
      )
    );
    const action = host.querySelector<HTMLButtonElement>(`[aria-label="${t("comment.reply")}"]`);
    if (!action) throw new Error("回复入口未挂载");
    await act(async () => action.click());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const field = host.querySelector("textarea");
    if (!field) throw new Error("回复输入未挂载");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        field,
        "回复草稿"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 3);
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(host.querySelector("textarea")).toBe(field);
      expect(field.value).toBe("回复草稿");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(reply).not.toHaveBeenCalled();
      expect(edit).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(comments[0].content).toBe("原始批注");
    }
    const submit = [...host.querySelectorAll("button")].find(
      button => button.textContent === t("comment.reply")
    );
    if (!submit) throw new Error("回复提交按钮未挂载");
    await act(async () => submit.click());
    expect(reply).toHaveBeenCalledExactlyOnceWith("thread-a", "回复草稿");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    runtime.dispose();
    vi.useRealTimers();
  }
});
