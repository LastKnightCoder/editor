import { expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), invoke: vi.fn() }));
vi.mock("@/electron", () => bridge);
import { subscribeDevelopmentBuilds } from "@/commands/plugin-development";

it("解包 preload 的事件参数，并使用相同函数释放订阅", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeDevelopmentBuilds(listener);
  const callback = bridge.on.mock.calls[0][1];
  const build = { token: "session", id: "example", watchId: "watch", buildId: "build" };
  callback({ sender: "electron-event" }, build);
  expect(listener).toHaveBeenCalledWith(build);
  unsubscribe();
  expect(bridge.off).toHaveBeenCalledWith("plugin-development:build", callback);
});
