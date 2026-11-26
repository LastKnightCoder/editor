import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { PageProvider } from "@/page/PageProvider";
import { definePage } from "@/page/definePage";
import { IntentCard, IntentButton } from "../IntentCard";
import { composeUiTranslator as tr } from "../../ui.i18n";

definePage({
  key: "compose-intent-locale",
  match: "single",
  label: "test",
  params: {},
  component: () => null,
});
async function mount(children: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <PageProvider initialKey="compose-intent-locale">{children}</PageProvider>
      </I18nRuntimeProvider>
    )
  );
  return {
    host,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
function action(key: Parameters<typeof tr.t>[0]) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === tr.t(key)
  );
  if (!button) throw new Error(`Missing action ${key}`);
  return button;
}
async function input(field: HTMLTextAreaElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!set) throw new Error("Missing native value setter");
  await act(async () => {
    set.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("意图卡换语保留原草稿、光标与资料类型选项，不重启或跳过并仍提交原协议值", async () => {
  const original = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const start = vi.fn(),
    skip = vi.fn();
  const { host, dispose } = await mount(
    <IntentCard initialIntent="原始预填正文" canGather busy={false} onStart={start} onSkip={skip} />
  );
  try {
    const field = host.querySelector("textarea");
    if (!field) throw new Error("Missing intent draft");
    await input(field, "  用户写作意图  ");
    field.focus();
    field.setSelectionRange(2, 5);
    const card = action("ui.kind.card");
    await act(async () => card.click());
    field.focus();
    field.setSelectionRange(2, 5);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("textarea")).toBe(field);
      expect(field.value).toBe("  用户写作意图  ");
      expect([field.selectionStart, field.selectionEnd]).toEqual([2, 5]);
      expect(document.activeElement).toBe(field);
      expect(card.getAttribute("aria-pressed")).toBe("false");
      expect(card.isConnected).toBe(true);
      expect(start).not.toHaveBeenCalled();
      expect(skip).not.toHaveBeenCalled();
    }
    await act(async () => action("ui.intent.gather").click());
    expect(start).toHaveBeenCalledTimes(1);
    const [intent, kinds] = start.mock.calls[0];
    expect(intent).toBe("用户写作意图");
    expect(kinds).toContain("article");
    expect(kinds).not.toContain("card");
    expect(new Set(kinds).size).toBe(kinds.length);
  } finally {
    await dispose();
    desktopLocaleSource.setLocale(original);
  }
});

it("编辑已保存意图时换语保留同一浮层字段和未保存草稿，只在保存时提交", async () => {
  const original = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  const change = vi.fn();
  const { host, dispose } = await mount(<IntentButton intent="原保存意图" onChange={change} />);
  try {
    const trigger = host.querySelector<HTMLButtonElement>("button");
    if (!trigger) throw new Error("Missing intent entry");
    await act(async () => trigger.click());
    const field = document.querySelector("textarea");
    if (!field) throw new Error("Missing intent field");
    await input(field, "  仍未保存的意图  ");
    field.focus();
    field.setSelectionRange(2, 5);
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector("textarea")).toBe(field);
      expect(field.value).toBe("  仍未保存的意图  ");
      expect([field.selectionStart, field.selectionEnd]).toEqual([2, 5]);
      expect(document.activeElement).toBe(field);
      expect(change).not.toHaveBeenCalled();
    }
    await act(async () => action("ui.save").click());
    expect(change).toHaveBeenCalledExactlyOnceWith("仍未保存的意图");
  } finally {
    await dispose();
    desktopLocaleSource.setLocale(original);
  }
});
