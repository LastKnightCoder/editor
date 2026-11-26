import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CollaborationSession, JoinRequest, Member } from "@tau/collaboration";
import { RouterProvider, PageHost, definePage, getNavigator, paramString } from "../../../router";
import { clearPageDefinitionsForTest } from "../../../router/registry";
import { clearPageMetasForTest } from "../../../router/core/pageMeta";
import { ActionSheet } from "../../../components/ActionSheet";
import { mobileLocaleSource } from "../../../services/i18n";
import { CollaborationCenterPage } from "../CollaborationCenterPage";
import { MemberManageSheet } from "../MemberManageSheet";
import { ShareContentSheet } from "../ShareContentSheet";
import { useContentCollabEntry } from "../useContentCollabEntry";
import { roomTranslator } from "../room.i18n";
import { useCollaborationStore } from "../core/store";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";
import { readCachedInvitation, writeCachedInvitation } from "../core/invitation-cache";
const native = vi.hoisted(() => ({
  decide: vi.fn(),
  remove: vi.fn(),
  rotate: vi.fn(),
  leave: vi.fn(),
  share: vi.fn(),
  retain: vi.fn(),
  release: vi.fn(),
  start: vi.fn(async () => undefined),
  binding: vi.fn(),
  detail: vi.fn(),
}));
const delivered = vi.hoisted(() => ({
  notify: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("../../../components/toast", () => ({
  toast: Object.assign(delivered.notify, {
    error: delivered.error,
    success: delivered.success,
    warning: delivered.warning,
  }),
}));
vi.mock("../core/manager", () => ({
  collaborationManager: {
    decideJoinRequest: native.decide,
    removeMember: native.remove,
    rotateInvitation: native.rotate,
    leave: native.leave,
    shareContent: native.share,
    retain: native.retain,
    release: native.release,
    start: native.start,
  },
}));
vi.mock("../../../services/tauri", () => ({
  collabGetBinding: native.binding,
  getContentDetail: native.detail,
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({
    syncSettings: { safeSetting: { collaboration: { nickname: "原始昵称" } } },
    presentError: () => undefined,
  }),
}));
const person = (id: string, role: Member["role"] = "editor"): Member => ({
  deviceId: id,
  nickname: `${id}原名`,
  role,
  online: true,
  activity: "viewing",
});
function session(
  id = "room-raw",
  role: CollaborationSession["role"] = "owner"
): CollaborationSession {
  return {
    id,
    title: `${id}原题`,
    ownerId: "owner",
    role,
    status: "active",
    members: [person("owner", "owner"), person("guest")],
    updatedAt: 0,
    serverUrl: "https://collab.example",
    connection: "connected",
    pending: false,
    leaving: false,
  };
}
let root: Root, host: HTMLDivElement;
let originalLocale: string, originalState: ReturnType<typeof useCollaborationStore.getState>;
let clipboard: PropertyDescriptor | undefined;
const writeText = vi.fn(async () => undefined);
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  for (const action of [
    native.decide,
    native.remove,
    native.rotate,
    native.leave,
    native.share,
    native.binding,
    native.detail,
  ])
    action.mockReset();
  native.start.mockReset().mockResolvedValue(undefined);
  originalLocale = mobileLocaleSource.getSnapshot();
  mobileLocaleSource.setLocale("zh-CN");
  originalState = useCollaborationStore.getState();
  useCollaborationStore.setState({
    status: "ready",
    sessions: [],
    requests: [],
    notices: [],
    deviceId: "owner",
  });
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  clearPageDefinitionsForTest();
  clearPageMetasForTest();
  window.history.replaceState(null, "");
  definePage({ key: "home", params: {}, component: () => null });
  definePage({ key: "collabEditor", params: { documentId: paramString() }, component: () => null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  useCollaborationStore.setState(originalState);
  mobileLocaleSource.setLocale(originalLocale);
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  host.remove();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function draw(content: ReactNode) {
  await act(async () => root.render(<RouterProvider rootKey="home">{content}</RouterProvider>));
  await act(async () => vi.dynamicImportSettled());
  await act(async () => vi.advanceTimersByTimeAsync(1));
}
function button(text: string, last = false) {
  const matches = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    item => item.textContent?.trim() === text
  );
  const found = last ? matches.at(-1) : matches[0];
  if (!found) throw new Error("协作动作未挂载");
  return found;
}

it("中心换语保留原会话顺序和焦点，审批在途不重发原请求", async () => {
  const owned = session("owned"),
    joined = session("joined", "editor");
  const sessions = [joined, owned];
  const request: JoinRequest = {
    id: "request-raw",
    documentId: owned.id,
    deviceId: "new-device",
    nickname: "申请者原名",
    status: "pending",
    expiresAt: Date.now() + 86400000,
  };
  useCollaborationStore.setState({ sessions, requests: [request] });
  let finish: (() => void) | undefined;
  native.decide.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const onError = vi.fn();
  await draw(<CollaborationCenterPage onBack={() => undefined} onError={onError} />);
  const selected = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item =>
    item.textContent?.includes(owned.title)
  );
  if (!selected) throw new Error("用户会话未挂载");
  await act(async () => selected.focus());
  const nodes = [...host.querySelectorAll("button")];
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect([...host.querySelectorAll("button")]).toEqual(nodes);
    expect(document.activeElement).toBe(selected);
    expect(useCollaborationStore.getState().sessions).toBe(sessions);
    expect(native.decide).not.toHaveBeenCalled();
  }
  await act(async () => button(roomTranslator.t("request.approve")).click());
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(button(roomTranslator.t("request.approve")).disabled).toBe(true);
  expect(native.decide).toHaveBeenCalledExactlyOnceWith(request.id, true);
  if (!finish) throw new Error("审批未启动");
  await act(async () => finish?.());
  expect(native.decide).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it("成员确认保留原目标，邀请码缓存换语不读写或轮换，主动轮换后仅写原码", async () => {
  const data = session();
  useCollaborationStore.setState({ sessions: [data] });
  const invitation = { code: "K7QXM3AZ9BCD", expiresAt: Date.now() + 2 * 86400000 };
  writeCachedInvitation(data.id, invitation);
  const read = vi.spyOn(Storage.prototype, "getItem"),
    write = vi.spyOn(Storage.prototype, "setItem");
  let finishRemove: (() => void) | undefined,
    finishRotate: ((value: typeof invitation) => void) | undefined;
  native.remove.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finishRemove = resolve;
      })
  );
  native.rotate.mockImplementation(
    () =>
      new Promise(resolve => {
        finishRotate = resolve;
      })
  );
  const onError = vi.fn(),
    guard = vi.fn();
  await draw(
    <MemberManageSheet
      documentId={data.id}
      guard={guard}
      onClose={() => undefined}
      onExit={() => undefined}
      onError={onError}
    />
  );
  const target = data.members[1];
  const remove = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    item =>
      item.getAttribute("aria-label") ===
      roomTranslator.t("member.removeLabel", { nickname: target.nickname })
  );
  if (!remove) throw new Error("成员移除入口未挂载");
  await act(async () => remove.click());
  const confirm = button(roomTranslator.t("member.remove"), true);
  await act(async () => confirm.focus());
  const cacheReads = read.mock.calls.length;
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(roomTranslator.t("member.remove"), true)).toBe(confirm);
    expect(document.activeElement).toBe(confirm);
    expect(read.mock.calls.length).toBe(cacheReads);
    expect(write).not.toHaveBeenCalled();
    expect(native.remove).not.toHaveBeenCalled();
    expect(native.rotate).not.toHaveBeenCalled();
  }
  await act(async () => confirm.click());
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(confirm.disabled).toBe(true);
  expect(native.remove).toHaveBeenCalledExactlyOnceWith(data.id, target.deviceId);
  if (!finishRemove) throw new Error("移除未启动");
  await act(async () => finishRemove?.());
  await act(async () => vi.advanceTimersByTimeAsync(201));
  await act(async () => button(roomTranslator.t("code.rotate")).click());
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(native.rotate).toHaveBeenCalledExactlyOnceWith(data.id);
  expect(write).not.toHaveBeenCalled();
  if (!finishRotate) throw new Error("轮换未启动");
  const next = { ...invitation, code: "23456789ABCD" };
  await act(async () => finishRotate?.(next));
  expect(readCachedInvitation(data.id)).toEqual(next);
  expect(write).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

it.each(["owner", "editor"] as const)(
  "%s退出确认换语不执行退出，确认后仅移除原房间一次",
  async role => {
    const data = session("leave-room", role);
    useCollaborationStore.setState({ sessions: [data] });
    let finish: (() => void) | undefined;
    native.leave.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const exit = vi.fn();
    await draw(
      <MemberManageSheet
        documentId={data.id}
        onClose={() => undefined}
        onExit={exit}
        onError={() => undefined}
      />
    );
    const owner = role === "owner";
    await act(async () =>
      button(roomTranslator.t(owner ? "leave.owner.label" : "leave.member.confirm")).click()
    );
    const confirmKey = owner ? "leave.owner.confirm" : "leave.member.confirm";
    const confirm = button(roomTranslator.t(confirmKey), true);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(button(roomTranslator.t(confirmKey), true)).toBe(confirm);
      expect(native.leave).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    }
    await act(async () => confirm.click());
    await act(async () => mobileLocaleSource.setLocale("zh-TW"));
    expect(native.leave).toHaveBeenCalledExactlyOnceWith(data.id);
    expect(confirm.disabled).toBe(true);
    if (!finish) throw new Error("退出未启动");
    await act(async () => finish?.());
    expect(exit).toHaveBeenCalledTimes(1);
  }
);

it("共享启动与失败换语不重放，原输入和expectedRef保留，重试成功后复制/导航使用原结果", async () => {
  let reject: ((cause: Error) => void) | undefined;
  native.share.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  const content = [{ type: "paragraph", children: [{ text: "用户正文原文" }] }];
  const source = {
    contentId: 42,
    title: "用户原题",
    content,
    bannerBg: "raw-banner",
    bannerPosition: "0.5",
    sourceType: "article",
    sourceId: 7,
  };
  const guard = vi.fn(),
    onError = vi.fn(),
    close = vi.fn(),
    expectedRef = "raw-content-ref";
  await draw(
    <ShareContentSheet
      open
      {...source}
      guard={guard}
      expectedRef={expectedRef}
      onClose={close}
      onError={onError}
    />
  );
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(native.share).toHaveBeenCalledExactlyOnceWith(source, guard, expectedRef);
    expect(native.share.mock.calls[0][0].content).toBe(content);
    expect(native.detail).not.toHaveBeenCalled();
    expect(native.start).toHaveBeenCalledExactlyOnceWith({ nickname: "原始昵称" });
    expect(native.retain).toHaveBeenCalledTimes(1);
  }
  if (!reject) throw new Error("共享未启动");
  const known = new Error("COLLAB_NETWORK: raw-trace");
  await act(async () => reject?.(known));
  const alert = document.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(document.querySelector('[role="alert"]')).toBe(alert);
  expect(onError.mock.calls[0][0]).toBe(known);
  expect(native.share).toHaveBeenCalledTimes(1);
  const unknown = new Error("服务器原始诊断: trace-43");
  native.share.mockRejectedValueOnce(unknown);
  await act(async () => button(roomTranslator.t("share.retry")).click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  const result = {
    documentId: "shared-document-raw",
    code: "K7QXM3AZ9BCD",
    expiresAt: Date.now() + 86400000,
  };
  native.share.mockResolvedValueOnce(result);
  await act(async () => button(roomTranslator.t("share.retry")).click());
  await act(async () => button(roomTranslator.t("code.copy")).click());
  expect(writeText).toHaveBeenCalledExactlyOnceWith(result.code);
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(native.share).toHaveBeenCalledTimes(3);
  expect(writeText).toHaveBeenCalledTimes(1);
  await act(async () => button(roomTranslator.t("share.enter")).click());
  expect(close).toHaveBeenCalledTimes(1);
  expect(getNavigator().getActiveScreen()).toMatchObject({
    key: "collabEditor",
    params: { documentId: result.documentId },
  });
  for (const call of native.share.mock.calls) {
    expect(call).toEqual([source, guard, expectedRef]);
    expect(call[0].content).toBe(content);
  }
});

function MenuHost() {
  const entry = useContentCollabEntry(77, { share: { title: "宿主原题" } });
  return <ActionSheet open title="用户菜单" items={entry.menuItems} onClose={() => undefined} />;
}
it("真实宿主菜单换语保留操作节点和焦点，不重读绑定或启动共享", async () => {
  native.binding.mockResolvedValue(null);
  await draw(<PageHost rootContent={<MenuHost />} />);
  const start = button(roomTranslator.t("menu.start"));
  await act(async () => start.focus());
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(roomTranslator.t("menu.start"))).toBe(start);
    expect(document.activeElement).toBe(start);
    expect(native.binding).toHaveBeenCalledExactlyOnceWith(77);
    expect(native.share).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  }
});

function RuntimeProbe() {
  useCollaborationRuntime();
  return null;
}
it("多页面只消费通知一次，换语不重放已有事件或启动错误，不增加连接", async () => {
  const failure = new Error("COLLAB_NETWORK: raw-connection-trace");
  native.start.mockRejectedValueOnce(failure);
  // 逐页结清懒加载，避免测试的并发导入越过传输替身。
  await import("../core/manager");
  await act(async () =>
    root.render(
      <>
        <RuntimeProbe key="first" />
      </>
    )
  );
  await act(async () => vi.dynamicImportSettled());
  await act(async () =>
    root.render(
      <>
        <RuntimeProbe key="first" />
        <RuntimeProbe key="second" />
      </>
    )
  );
  await act(async () => vi.dynamicImportSettled());
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(native.start).toHaveBeenCalledWith({ nickname: "原始昵称" });
  expect(delivered.error).toHaveBeenCalledTimes(1);
  const starts = [...native.start.mock.calls],
    retains = [...native.retain.mock.calls];
  const first = {
    id: "closed-notice-raw",
    kind: "closed" as const,
    documentId: "document-raw",
    title: "用户原题",
  };
  await act(async () => useCollaborationStore.setState({ notices: [first] }));
  expect(delivered.notify).toHaveBeenCalledTimes(1);
  const payload = delivered.notify.mock.calls[0][0];
  expect(payload).toMatchObject({ type: "warning" });
  expect(payload.text).toContain(first.title);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(delivered.notify).toHaveBeenCalledTimes(1);
    expect(delivered.notify.mock.calls[0][0]).toBe(payload);
    expect(delivered.error).toHaveBeenCalledTimes(1);
    expect(native.start.mock.calls).toEqual(starts);
    expect(native.retain.mock.calls).toEqual(retains);
    expect(native.release).not.toHaveBeenCalled();
    expect(useCollaborationStore.getState().notices).toEqual([]);
    expect(failure.message).toBe("COLLAB_NETWORK: raw-connection-trace");
  }
  const next = {
    id: "revoked-notice-raw",
    kind: "revoked" as const,
    documentId: "document-raw",
    title: "另一个用户原题",
  };
  await act(async () => useCollaborationStore.setState({ notices: [next] }));
  expect(delivered.notify).toHaveBeenCalledTimes(2);
  expect(delivered.notify.mock.calls[1][0].text).toContain(next.title);
  expect(useCollaborationStore.getState().notices).toEqual([]);
  expect(first.id).toBe("closed-notice-raw");
  expect(next.id).toBe("revoked-notice-raw");
});
