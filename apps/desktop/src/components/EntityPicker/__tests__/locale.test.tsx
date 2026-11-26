import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { EntityPicker } from "..";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { pickerTranslator } from "../i18n";
import { searchEntities } from "@/commands";

vi.mock("@/commands", () => ({ searchEntities: vi.fn() }));
it("切换语言保留查询、焦点和所选内容，不重新搜索或提前确认", async () => {
  const candidate = {
    kind: "card" as const,
    id: 71,
    contentId: 73,
    title: "用户原始标题",
    time: 1,
    meta: "",
    excerpt: "",
  };
  vi.mocked(searchEntities).mockResolvedValue([candidate]);
  const original = desktopLocaleSource.getSnapshot();
  const confirm = vi.fn(),
    close = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <EntityPicker
            open
            title="关联测试"
            kinds={["card", "article"]}
            onClose={close}
            onConfirm={confirm}
          />
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
    });
    const row = document.querySelector<HTMLButtonElement>('[role="option"]');
    const field = document.querySelector<HTMLInputElement>("input");
    if (!row || !field) throw new Error("选择器未挂载");
    await act(async () => row.click());
    vi.useFakeTimers();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "未提交查询"
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    field.setSelectionRange(1, 3);
    const calls = vi.mocked(searchEntities).mock.calls.length;
    const keys = client
      .getQueryCache()
      .getAll()
      .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector("input")).toBe(field);
      expect(field.value).toBe("未提交查询");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
      expect(document.querySelector('[role="option"][aria-selected="true"]')).toBe(row);
      expect(vi.mocked(searchEntities).mock.calls.length).toBe(calls);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(confirm).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
    const button = [...document.querySelectorAll("button")].find(
      button => button.textContent === pickerTranslator.t("link")
    );
    if (!button) throw new Error("确认入口未挂载");
    await act(async () => button.click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith([candidate]);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    desktopLocaleSource.setLocale(original);
    vi.useRealTimers();
    vi.clearAllMocks();
  }
});
