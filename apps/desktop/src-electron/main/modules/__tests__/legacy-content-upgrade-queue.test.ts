// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LegacyContentUpgradeQueue, type LegacyUpgradeJob } from "../legacy-content-upgrade-queue";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("正文与白板后台升级队列", () => {
  it("无打开动作也遍历正文和白板，单项失败不妨碍后续内容", async () => {
    const calls: string[] = [],
      finished = vi.fn();
    const queue = new LegacyContentUpgradeQueue({
      async *jobs() {
        yield {
          key: "content:1",
          run: async () => {
            calls.push("content");
          },
        };
        yield {
          key: "content:2",
          run: async () => {
            calls.push("bad");
            throw new Error("磁盘空间不足");
          },
        };
        yield {
          key: "whiteboard:3",
          run: async () => {
            calls.push("board");
          },
        };
      },
      current: () => true,
      finished,
      yield: async () => {},
    });
    queue.request("库");
    await queue.idle();
    expect(calls).toEqual(["content", "bad", "bad", "bad", "board"]);
    expect(finished).toHaveBeenCalledWith("库", [{ key: "content:2", message: "磁盘空间不足" }]);
  });

  it("重试成功不提示用户，多窗口重复请求不并发安装", async () => {
    const gate = deferred(),
      entered = deferred(),
      finished = vi.fn();
    let attempts = 0,
      active = 0,
      maximum = 0,
      complete = false;
    const queue = new LegacyContentUpgradeQueue({
      async *jobs() {
        if (!complete)
          yield {
            key: "board",
            run: async () => {
              maximum = Math.max(maximum, ++active);
              entered.resolve();
              await gate.promise;
              active--;
              if (++attempts === 1) throw new Error("暂时断网");
              complete = true;
            },
          };
      },
      current: () => true,
      finished,
      yield: async () => {},
    });
    queue.request("库");
    await entered.promise;
    queue.request("库");
    queue.request("库");
    gate.resolve();
    await queue.idle();
    expect(maximum).toBe(1);
    expect(attempts).toBe(2);
    expect(finished.mock.calls.every(([, failures]) => failures.length === 0)).toBe(true);
  });

  it("切库屏障等待当前安装，暂停期间不启动下一项，恢复后重新清点", async () => {
    const gate = deferred(),
      entered = deferred(),
      complete = new Set<string>(),
      calls: string[] = [];
    const queue = new LegacyContentUpgradeQueue({
      async *jobs() {
        for (const key of ["content", "board"])
          if (!complete.has(key))
            yield {
              key,
              run: async () => {
                calls.push(key);
                if (key === "content") {
                  entered.resolve();
                  await gate.promise;
                }
                complete.add(key);
              },
            };
      },
      current: () => true,
      finished: vi.fn(),
      yield: async () => {},
    });
    queue.request("库");
    await entered.promise;
    const paused = queue.pause();
    gate.resolve();
    const resume = await paused;
    expect(calls).toEqual(["content"]);
    resume();
    await Promise.resolve();
    await queue.idle();
    expect(calls).toEqual(["content", "board"]);
  });

  it("连接失效不继续写入，也不误记为升级完成", async () => {
    let current = true;
    const second = vi.fn(),
      finished = vi.fn();
    const jobs: LegacyUpgradeJob[] = [
      {
        key: "first",
        run: async () => {
          current = false;
        },
      },
      { key: "second", run: second },
    ];
    const queue = new LegacyContentUpgradeQueue({
      async *jobs() {
        yield* jobs;
      },
      current: () => current,
      finished,
      yield: async () => {},
    });
    queue.request("库");
    await queue.idle();
    expect(second).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
  });
});

it("状态通知失败不会形成未处理拒绝或锁死后续队列", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const finished = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error("通知失败");
    })
    .mockImplementationOnce(() => {
      throw new Error("通知仍失败");
    });
  const queue = new LegacyContentUpgradeQueue({
    async *jobs() {
      yield { key: "content", run: async () => {} };
    },
    current: () => true,
    yield: async () => {},
    finished,
  });
  try {
    queue.request("A");
    await queue.idle();
    expect(report).toHaveBeenCalledTimes(1);
    queue.request("B");
    await queue.idle();
    expect(finished).toHaveBeenLastCalledWith("B", []);
  } finally {
    report.mockRestore();
  }
});
