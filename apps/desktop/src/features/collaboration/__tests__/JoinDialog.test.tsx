import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JoinDialog } from "../components/JoinDialog";
import { NicknameChip } from "../components/NicknameChip";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { collaborationTranslator } from "../i18n";

const mocks = vi.hoisted(() => ({ join: vi.fn(), nickname: vi.fn() }));
vi.mock("@/commands", () => ({
  joinCollaboration: mocks.join,
  setCollaborationNickname: mocks.nickname,
}));
vi.mock("@/components/CollaborationUI", () => ({ Avatar: () => null }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  mocks.join.mockReset();
  mocks.nickname.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const segments = () => [
  ...document.querySelectorAll<HTMLInputElement>('input[aria-label^="协作码第"]'),
];
const submitButton = () =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.includes("申请加入"))!;

function paste(input: HTMLInputElement, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: () => string };
  };
  event.clipboardData = { getData: () => text };
  input.dispatchEvent(event);
}

it("粘贴整段协作码自动分三段，满 12 位才可提交", async () => {
  mocks.join.mockResolvedValue(undefined);
  await act(async () => root.render(<JoinDialog open onOpenChange={() => {}} nickname="小熊" />));
  expect(submitButton().disabled).toBe(true);

  await act(async () => paste(segments()[0], " k7qx-m3az 9bcd "));
  expect(segments().map(i => i.value)).toEqual(["K7QX", "M3AZ", "9BCD"]);
  expect(submitButton().disabled).toBe(false);

  await act(async () => submitButton().click());
  expect(mocks.join).toHaveBeenCalledWith("K7QXM3AZ9BCD");
  expect(document.body.textContent).toContain("申请已发出");
});

it("提交失败时原位显示错误，保留已输入的码", async () => {
  mocks.join.mockRejectedValue(new Error("协作码无效或已过期"));
  await act(async () => root.render(<JoinDialog open onOpenChange={() => {}} nickname="小熊" />));
  await act(async () => paste(segments()[0], "AAAAAAAAAAAA"));
  await act(async () => submitButton().click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("协作码无效或已过期");
  expect(segments().map(i => i.value)).toEqual(["AAAA", "AAAA", "AAAA"]);
});

function currentSubmit() {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item =>
    item.textContent?.includes(collaborationTranslator.t("join.submit"))
  );
  if (!button) throw new Error("加入操作未挂载");
  return button;
}

it("加入请求中换语不重发，失败后保留原始协作码和焦点，主动重试仍发送原码", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const closed = vi.fn();
  let reject: ((error: Error) => void) | undefined;
  mocks.join.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(<JoinDialog open onOpenChange={closed} nickname="用户原名" />);
    });
    await act(async () => paste(segments()[0], " k7qx-m3az 9bcd "));
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[maxlength="4"]')];
    const submit = currentSubmit();
    await act(async () => submit.click());
    inputs[1].focus();
    inputs[1].setSelectionRange(1, 3);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect([...document.querySelectorAll('input[maxlength="4"]')]).toEqual(inputs);
      expect(inputs.map(input => input.value)).toEqual(["K7QX", "M3AZ", "9BCD"]);
      expect(document.activeElement).toBe(inputs[1]);
      expect([inputs[1].selectionStart, inputs[1].selectionEnd]).toEqual([1, 3]);
      expect(submit.disabled).toBe(true);
      expect(mocks.join).toHaveBeenCalledExactlyOnceWith("K7QXM3AZ9BCD");
      expect(closed).not.toHaveBeenCalled();
    }
    if (!reject) throw new Error("加入请求未启动");
    const failure = new Error("unknown remote response: trace-42");
    await act(async () => reject?.(failure));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(failure.message);
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    expect([...document.querySelectorAll('input[maxlength="4"]')]).toEqual(inputs);
    expect(inputs.map(input => input.value)).toEqual(["K7QX", "M3AZ", "9BCD"]);
    expect(document.activeElement).toBe(inputs[1]);
    expect(mocks.join).toHaveBeenCalledTimes(1);
    mocks.join.mockResolvedValueOnce(undefined);
    await act(async () => currentSubmit().click());
    expect(mocks.join.mock.calls).toEqual([["K7QXM3AZ9BCD"], ["K7QXM3AZ9BCD"]]);
    await act(async () => desktopLocaleSource.setLocale("en-US"));
    expect(document.querySelector('input[maxlength="4"]')).toBeNull();
    expect(mocks.join).toHaveBeenCalledTimes(2);
    expect(closed).not.toHaveBeenCalled();
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

function editNickname(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[maxlength="40"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!input || !setter) throw new Error("昵称输入未挂载");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

it("昵称草稿与光标跨语言保留，Esc不保存，回车只提交修剪后的原始名字一次", async () => {
  const original = desktopLocaleSource.getSnapshot();
  let finish: (() => void) | undefined;
  mocks.nickname.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(<NicknameChip deviceId="raw-device" nickname="原名" />);
    });
    const chip = host.querySelector("button");
    if (!chip) throw new Error("昵称入口未挂载");
    await act(async () => chip.click());
    let input: HTMLInputElement | undefined;
    await act(async () => {
      input = editNickname("  用户草稿 mixed  ");
    });
    if (!input) throw new Error("昵称草稿未挂载");
    input.setSelectionRange(3, 7);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('input[maxlength="40"]')).toBe(input);
      expect(input.value).toBe("  用户草稿 mixed  ");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 7]);
      expect(mocks.nickname).not.toHaveBeenCalled();
    }
    await act(async () =>
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );
    expect(document.querySelector('input[maxlength="40"]')).toBeNull();
    expect(mocks.nickname).not.toHaveBeenCalled();
    const reopen = host.querySelector("button");
    if (!reopen) throw new Error("昵称入口未恢复");
    await act(async () => reopen.click());
    await act(async () => {
      input = editNickname("  新名字 mixed  ");
    });
    await act(async () =>
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    );
    expect(mocks.nickname).toHaveBeenCalledExactlyOnceWith("新名字 mixed");
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    expect(mocks.nickname).toHaveBeenCalledTimes(1);
    expect(host.querySelector("button")?.disabled).toBe(true);
    if (!finish) throw new Error("昵称保存未启动");
    await act(async () => finish?.());
    expect(host.querySelector("button")?.disabled).toBe(false);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
