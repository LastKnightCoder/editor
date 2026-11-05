import { afterEach, describe, expect, it, vi } from "vitest";
import { createInlineSuggestionController } from "./controller";

afterEach(() => vi.useRealTimers());

describe("行内建议的提交边界", () => {
  it("丢弃已取消的响应，并在用户采纳时复核已显示的快照", async () => {
    vi.useFakeTimers();
    let revision = 1;
    const insert = vi.fn();
    const requests: Array<{ signal: AbortSignal; resolve: (text: string) => void }> = [];
    const controller = createInlineSuggestionController(
      {
        capture: () => ({ stamp: revision, context: { before: "正文", after: "" } }),
        isCurrent: stamp => stamp === revision,
        tryInsert: (stamp, text) => {
          if (stamp !== revision) return false;
          insert(text);
          return true;
        },
      },
      {
        suggest: (_, signal) => new Promise(resolve => requests.push({ signal, resolve })),
      }
    );

    controller.userInput();
    await vi.advanceTimersByTimeAsync(400);
    revision++;
    controller.revalidate();
    expect(requests[0].signal.aborted).toBe(true);

    controller.userInput();
    await vi.advanceTimersByTimeAsync(400);
    requests[1].resolve("新建议");
    await Promise.resolve();
    requests[0].resolve("旧建议");
    await Promise.resolve();
    expect(controller.getSnapshot()?.text).toBe("新建议");

    revision++;
    expect(controller.accept()).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toBeNull();
  });
});
