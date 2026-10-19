import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
  isRemoteAppliedSnapshot,
} from "@/stores/useSettingStore";
import { connectSettingReplica } from "../setting-replica";

class Channel {
  static latest: Channel;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor() {
    Channel.latest = this;
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
}
const original = structuredClone(useSettingStore.getState().setting);
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("BroadcastChannel", Channel);
  useSettingStore.setState({ inited: false, setting: structuredClone(original) });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useSettingStore.setState({ inited: false, setting: structuredClone(original) });
});

describe("主窗口设置快照", () => {
  it("主窗口就绪后广播，后来打开的窗口可以请求当前快照", () => {
    const fallback = vi.fn();
    cleanup = connectSettingReplica(true, fallback);
    expect(Channel.latest.postMessage).not.toHaveBeenCalled();
    useSettingStore.setState({ inited: true });
    expect(Channel.latest.postMessage).toHaveBeenCalledTimes(1);
    Channel.latest.receive({ kind: "request" });
    expect(Channel.latest.postMessage).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("辅助窗口保留账号状态，不重复读后端或回灌设置", async () => {
    const fallback = vi.fn();
    cleanup = connectSettingReplica(false, fallback);
    const setting = structuredClone(original);
    setting.integration.github.user.name = "replica";
    Channel.latest.receive({ kind: "snapshot", setting });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fallback).not.toHaveBeenCalled();
    expect(useSettingStore.getState().inited).toBe(true);
    expect(useSettingStore.getState().setting.integration.github.user.name).toBe("replica");
    expect(isRemoteAppliedSnapshot(JSON.stringify(buildPersistedSettingSnapshot(setting)))).toBe(
      true
    );
  });

  it("无主窗口时只读兜底，迟到兜底不能覆盖主窗口新快照", async () => {
    let resolve!: (setting: typeof original) => void;
    const fallback = vi.fn(() => new Promise<typeof original>(done => (resolve = done)));
    cleanup = connectSettingReplica(false, fallback);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fallback).toHaveBeenCalledTimes(1);
    const setting = structuredClone(original);
    setting.fontSetting.fontSize = 19;
    Channel.latest.receive({ kind: "snapshot", setting });
    resolve(original);
    await Promise.resolve();
    expect(useSettingStore.getState().setting.fontSetting.fontSize).toBe(19);
  });
});
