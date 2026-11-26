import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CollaborationSession, Member, SharedWhiteboardInfo } from "@tau/collaboration";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { CollaborationNavSessions } from "@/features/collaboration/components/CollaborationNav";
import { MemberList } from "../MemberList";
import { LeaveDialog } from "../LeaveDialog";
import { InvitationCode } from "../InvitationCode";
import { createAssetMedia } from "../AssetMedia";
import { roomTranslator } from "../room.i18n";
const native = vi.hoisted(() => ({
  remove: vi.fn(),
  leave: vi.fn(),
  discard: vi.fn(),
  getCode: vi.fn(),
  rotate: vi.fn(),
  decide: vi.fn(),
}));
vi.mock("@/commands", () => ({
  removeCollaborationMember: native.remove,
  leaveCollaboration: native.leave,
  discardLocalCollaboration: native.discard,
  getCurrentCollaborationInvitation: native.getCode,
  generateCollaborationInvitation: native.rotate,
  decideJoinRequest: native.decide,
}));
const member = (id: string, role: Member["role"] = "editor"): Member => ({
  deviceId: id,
  nickname: `${id}原名`,
  role,
  online: true,
  activity: "viewing",
});
function session(id = "room-raw", patch: Partial<CollaborationSession> = {}): CollaborationSession {
  return {
    id,
    title: `${id}原题`,
    ownerId: "owner",
    role: "owner",
    status: "active",
    members: [member("owner", "owner"), member("guest")],
    updatedAt: 0,
    serverUrl: "https://collab.example",
    connection: "connected",
    pending: false,
    leaving: false,
    ...patch,
  };
}
let root: Root, host: HTMLDivElement, client: QueryClient;
let originalLocale: string, originalState: ReturnType<typeof useCollaborationStore.getState>;
let clipboard: PropertyDescriptor | undefined;
const writeText = vi.fn(async () => undefined);
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  for (const operation of Object.values(native)) operation.mockReset();
  originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  originalState = useCollaborationStore.getState();
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  useCollaborationStore.setState(originalState);
  desktopLocaleSource.setLocale(originalLocale);
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});
async function draw(content: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{content}</QueryClientProvider>)
  );
  await act(async () => vi.advanceTimersByTimeAsync(1));
}
function textButton(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === text
  );
  if (!found) throw new Error("确认动作未挂载");
  return found;
}
function labelledButton(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.getAttribute("aria-label") === label
  );
  if (!found) throw new Error("带标签的动作未挂载");
  return found;
}

it("协作分组换语不重挂选中内容、改变房间对象或焦点，点击仍分发原ID", async () => {
  const mine = session("owned");
  const joined = session("joined", { role: "editor" });
  const board: SharedWhiteboardInfo = {
    id: "board-raw",
    title: "用户白板原题",
    ownerId: "other",
    role: "editor",
    status: "active",
    members: [],
    updatedAt: 0,
    serverUrl: "https://collab.example",
  };
  const sessions = [joined, mine];
  useCollaborationStore.setState({ sessions, whiteboards: [board], requests: [], synced: true });
  const select = vi.fn();
  await draw(<CollaborationNavSessions selectedId={mine.id} onSelect={select} />);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  const selected = host.querySelector<HTMLButtonElement>('[aria-current="page"]');
  if (!selected) throw new Error("协作选中内容未挂载");
  await act(async () => selected.focus());
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect([...host.querySelectorAll("button")]).toEqual(buttons);
    expect(host.querySelector('[aria-current="page"]')).toBe(selected);
    expect(document.activeElement).toBe(selected);
    expect(useCollaborationStore.getState().sessions).toBe(sessions);
    expect(mine.title).toBe("owned原题");
    expect(select).not.toHaveBeenCalled();
  }
  const target = buttons.find(button => button.textContent?.includes(joined.title));
  if (!target) throw new Error("加入的房间未挂载");
  await act(async () => target.click());
  expect(select).toHaveBeenCalledExactlyOnceWith(joined.id);
});

it("移除成员确认换语保持原目标与在途确认，只在主动确认时发送原设备ID", async () => {
  const data = session();
  let finish: (() => void) | undefined;
  native.remove.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  await draw(<MemberList session={data} deviceId="owner" />);
  const guest = data.members[1];
  await act(async () =>
    labelledButton(roomTranslator.t("member.removeLabel", { nickname: guest.nickname })).click()
  );
  const confirm = textButton(roomTranslator.t("member.remove"));
  await act(async () => confirm.focus());
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(textButton(roomTranslator.t("member.remove"))).toBe(confirm);
    expect(document.activeElement).toBe(confirm);
    expect(native.remove).not.toHaveBeenCalled();
    expect(data.members[1]).toBe(guest);
  }
  await act(async () => confirm.click());
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(confirm.disabled).toBe(true);
  expect(native.remove).toHaveBeenCalledExactlyOnceWith(data.id, guest.deviceId);
  if (!finish) throw new Error("移除请求未启动");
  await act(async () => finish?.());
  expect(native.remove).toHaveBeenCalledTimes(1);
  expect(guest.nickname).toBe("guest原名");
});

it("作者未同步改动换语后仍禁止结束；同步完成后确认只执行原退出协议一次", async () => {
  const blocked = session("owner-room", { pending: true });
  const close = vi.fn(),
    left = vi.fn();
  let finish: (() => void) | undefined;
  native.leave.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  await draw(<LeaveDialog session={blocked} open onOpenChange={close} onLeft={left} />);
  const confirm = textButton(roomTranslator.t("leave.owner-pending.confirm"));
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(textButton(roomTranslator.t("leave.owner-pending.confirm"))).toBe(confirm);
    expect(confirm.disabled).toBe(true);
    expect(native.leave).not.toHaveBeenCalled();
    expect(native.discard).not.toHaveBeenCalled();
  }
  const synced = { ...blocked, pending: false };
  await draw(<LeaveDialog session={synced} open onOpenChange={close} onLeft={left} />);
  expect(confirm.disabled).toBe(false);
  await act(async () => confirm.click());
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(native.leave).toHaveBeenCalledExactlyOnceWith(synced.id, false);
  expect(native.discard).not.toHaveBeenCalled();
  expect(left).not.toHaveBeenCalled();
  if (!finish) throw new Error("退出请求未启动");
  await act(async () => finish?.());
  expect(left).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledExactlyOnceWith(false);
});

it("邀请码缓存与复制原码跨语言保留，换语不读取或轮换，在途轮换只提交一次", async () => {
  const data = { code: "K7QXM3AZ9BCD", expiresAt: Date.now() + 2 * 86400000 };
  native.getCode.mockResolvedValue(data);
  let finish: ((value: typeof data) => void) | undefined;
  native.rotate.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const source = session();
  await draw(<InvitationCode session={source} />);
  const code = document.querySelector('[data-testid="collaboration-code"]');
  if (!code) throw new Error("邀请码未挂载");
  const query = client
    .getQueryCache()
    .find({ queryKey: ["collaboration", "invitation", source.id] });
  if (!query) throw new Error("邀请码查询未建立");
  const copy = labelledButton(roomTranslator.t("invitation.copy"));
  await act(async () => copy.click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith("K7QX-M3AZ-9BCD");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector('[data-testid="collaboration-code"]')).toBe(code);
    expect(code.textContent).toBe("K7QX-M3AZ-9BCD");
    expect(labelledButton(roomTranslator.t("invitation.copy"))).toBe(copy);
    expect(client.getQueryCache().getAll()).toEqual([query]);
    expect(query.state.data).toBe(data);
    expect(native.getCode).toHaveBeenCalledExactlyOnceWith(source.id);
    expect(native.rotate).not.toHaveBeenCalled();
  }
  await act(async () => textButton(roomTranslator.t("invitation.rotate")).click());
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(native.rotate).toHaveBeenCalledExactlyOnceWith(source.id);
  expect(native.getCode).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledTimes(1);
  if (!finish) throw new Error("轮换请求未启动");
  const next = { ...data, code: "23456789ABCD" };
  await act(async () => finish?.(next));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(query.state.data).toEqual(next);
  expect(native.rotate).toHaveBeenCalledTimes(1);
});

it("协作媒体切换语言保留已解析资源和播放器节点，不重新读取资源", async () => {
  const resolveResource = vi.fn(async () => "blob:resolved-original");
  const NativeVideo = ({ src }: { src?: string }) => <video src={src} />;
  const Video = createAssetMedia(NativeVideo, { resolveResource }, "video");
  const source = "tau-collab-asset:original-asset";
  await draw(<Video src={source} />);
  const video = host.querySelector("video");
  if (!video) throw new Error("协作播放器未挂载");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("video")).toBe(video);
    expect(video.getAttribute("src")).toBe("blob:resolved-original");
    expect(resolveResource).toHaveBeenCalledExactlyOnceWith(source);
  }
});
