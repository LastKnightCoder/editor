import { expect, it, vi } from "vitest";
import type { PluginWindowAppearance } from "@tau/plugins";
import { connectWindowCommunication } from "../window-communication";
import {
  SYSTEM_LOCALE,
  type WindowCommunicationEvents,
  type WindowTransport,
} from "../../../../shared/plugin-window-protocol";

it("窗口启动期间的新语言事件优先于旧快照，关闭后不再交付变化", () => {
  const on = vi.fn<WindowTransport["on"]>(() => () => undefined);
  const transport: WindowTransport = { invoke: vi.fn().mockResolvedValue(undefined), on };
  const controller = new AbortController();
  const locales: string[] = [];
  const appearance: PluginWindowAppearance = {
    themeId: "paper",
    appearance: "system",
    mode: "light",
    font: { chineseFont: "system", englishFont: "system", codeFont: "monospace", fontSize: 13 },
  };
  const connection = connectWindowCommunication(
    transport,
    controller.signal,
    () => appearance,
    undefined,
    locale => locales.push(locale)
  );
  // 模拟真实传输在 bootstrap 返回前投递状态，初始快照随后到达。
  const receive = on.mock.calls[0]?.[1];
  if (!receive) throw new Error("传输未连接状态订阅");
  const event = (revision: number, value: string): WindowCommunicationEvents["stateChanged"] => ({
    endpoint: "endpoint",
    change: {
      scope: "app",
      key: SYSTEM_LOCALE,
      snapshot: { revision, value },
    },
  });
  receive(event(2, "en-US"));
  connection.bind("endpoint", { revision: 1, value: appearance }, { revision: 1, value: "zh-CN" });
  expect(locales).toEqual(["en-US"]);
  receive(event(1, "zh-CN"));
  expect(locales).toEqual(["en-US"]);
  receive(event(3, "zh-CN"));
  expect(locales).toEqual(["en-US", "zh-CN"]);
  controller.abort();
  receive(event(4, "en-US"));
  expect(locales).toEqual(["en-US", "zh-CN"]);
});
