import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "../singleFlight";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("进行中时并发调用复用同一次执行", async () => {
    const gate = deferred<number>();
    const fn = vi.fn(() => gate.promise);
    const run = createSingleFlight(fn);

    const first = run();
    const second = run();
    expect(fn).toHaveBeenCalledTimes(1);
    gate.resolve(42);
    await expect(first).resolves.toBe(42);
    await expect(second).resolves.toBe(42);
  });

  it("落定后可再次执行", async () => {
    let count = 0;
    const run = createSingleFlight(async () => ++count);
    await expect(run()).resolves.toBe(1);
    await expect(run()).resolves.toBe(2);
  });

  it("失败向外传播且不锁死后续调用", async () => {
    let calls = 0;
    const gate = deferred<number>();
    let useGate = true;
    const run = createSingleFlight(() => {
      calls += 1;
      return useGate ? gate.promise : Promise.resolve(7);
    });

    const first = run();
    run();
    gate.reject(new Error("boom"));
    await expect(first).rejects.toThrow("boom");
    expect(calls).toBe(1);

    useGate = false;
    await expect(run()).resolves.toBe(7);
    expect(calls).toBe(2);
  });

  it("isActive 反映进行状态", async () => {
    const gate = deferred<number>();
    const run = createSingleFlight(() => gate.promise);
    expect(run.isActive()).toBe(false);

    const task = run();
    expect(run.isActive()).toBe(true);

    gate.resolve(1);
    await task;
    expect(run.isActive()).toBe(false);
  });
});
