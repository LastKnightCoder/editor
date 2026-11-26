import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { sidebarT } from "@/components/ChatSidebar/sidebar.binding";
import ChatManagementSidebar from "../components/ChatManagementSidebar";
import useChatSessionStore, { ChatBucketStatus } from "@/stores/useChatSessionStore";
import type { ChatSessionRow } from "@/types/chat-session";

const ipc = vi.hoisted(() => {
  const invoke = vi.fn();
  window.electron = {
    platform: "darwin",
    invoke,
    on: () => undefined,
    off: () => undefined,
    send: () => undefined,
  } as unknown as ElectronAPI;
  return { invoke };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  ipc.invoke.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await act(async () => desktopLocaleSource.setLocale("zh-CN"));
});

it("换语保留分组展开、原始会话与分组草稿焦点，在途创建只提交一次", async () => {
  const group = {
    id: 17,
    name: "新对话",
    parentId: null,
    orderIndex: 0,
    createTime: 1,
    updateTime: 1,
  };
  const chat: ChatSessionRow = {
    id: "raw-session",
    scope: "main-chat",
    domainRef: null,
    sessionFile: "原始文件.jsonl",
    cwd: "",
    title: "待办清单",
    titleDirty: true,
    createTime: 1,
    updateTime: 1000,
    messageCount: 2,
    groupId: group.id,
    archived: false,
    orderNum: null,
    source: "desktop",
  };
  const bucket = { rows: [chat], status: ChatBucketStatus.SUCCESS };
  useChatSessionStore.setState({
    groups: [group],
    buckets: { "main-chat|": bucket },
    opened: {},
    currentIds: {},
  });
  const select = vi.fn();
  await act(async () =>
    root.render(<ChatManagementSidebar selectedChatId={chat.id} onChatSelect={select} />)
  );
  const header = Array.from(
    host.querySelectorAll<HTMLElement>('[role="button"][aria-expanded]')
  ).find(item => item.textContent?.includes(group.name));
  if (!header) throw new Error("missing user group");
  await act(async () => header.click());
  const newGroup = Array.from(host.querySelectorAll("button")).find(
    button => button.textContent === sidebarT("group.new")
  );
  if (!newGroup) throw new Error("missing group action");
  await act(async () => newGroup.click());
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
  if (!input) throw new Error("missing group draft");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setValue) throw new Error("missing native input setter");
  await act(async () => {
    setValue.call(input, "用户新分组");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.focus();
  input.setSelectionRange(1, 3);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector('[role="dialog"] input')).toBe(input);
    expect(input.value).toBe("用户新分组");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(useChatSessionStore.getState().buckets["main-chat|"]).toBe(bucket);
    expect(useChatSessionStore.getState().groups[0]).toBe(group);
    expect(select).not.toHaveBeenCalled();
    expect(ipc.invoke).not.toHaveBeenCalled();
  }
  let finish!: (value: typeof group) => void;
  ipc.invoke.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  );
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
  expect(ipc.invoke).toHaveBeenCalledWith("chat-group:create", {
    name: "用户新分组",
    parentId: null,
  });
  expect(input.value).toBe("用户新分组");
  await act(async () => finish({ ...group, id: 18, name: "用户新分组" }));
  expect(useChatSessionStore.getState().groups.map(item => item.name)).toEqual([
    "新对话",
    "用户新分组",
  ]);
  const current = host.querySelector<HTMLElement>('[aria-current="true"]');
  if (!current) throw new Error("missing selected chat");
  await act(async () => current.click());
  expect(select).toHaveBeenCalledWith(chat.id);
});
