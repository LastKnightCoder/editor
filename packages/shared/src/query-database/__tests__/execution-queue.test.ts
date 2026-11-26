import { afterEach, expect, it, vi } from "vitest";
import { createQueryExecutionQueue } from "../execution-queue";
import type { QueryResult } from "../types";

const data: QueryResult = {
  columns: [{ key: "n", title: "n", type: "number" }],
  rows: [{ id: "one", values: { n: 1 } }],
};
afterEach(() => vi.useRealTimers());

it("执行槽占满后按序等待，取消等待项不会启动它", async () => {
  const queue = createQueryExecutionQueue(1, 2);
  let resolve: (value: QueryResult) => void = () => undefined;
  const first = queue.start(
    () => ({
      result: new Promise<QueryResult>(done => {
        resolve = done;
      }),
      cancel: vi.fn(),
    }),
    5000
  );
  const cancelledRun = vi.fn();
  const second = queue.start(cancelledRun, 5000);
  const rejected = expect(second.result).rejects.toMatchObject({ name: "AbortError" });
  second.cancel();
  const thirdRun = vi.fn(() => ({ result: Promise.resolve(data), cancel: vi.fn() }));
  const third = queue.start(thirdRun, 5000);
  expect(thirdRun).not.toHaveBeenCalled();
  resolve(data);
  await Promise.all([first.result, third.result, rejected]);
  expect(cancelledRun).not.toHaveBeenCalled();
  expect(thirdRun).toHaveBeenCalledOnce();
});

it("超时与取消都释放执行槽，迟到结果不能再次释放别人的槽", async () => {
  vi.useFakeTimers();
  const queue = createQueryExecutionQueue(1, 2);
  let resolveLate: (value: QueryResult) => void = () => undefined;
  const cancel = vi.fn();
  const first = queue.start(
    () => ({
      result: new Promise<QueryResult>(done => {
        resolveLate = done;
      }),
      cancel,
    }),
    100
  );
  const timedOut = expect(first.result).rejects.toThrow("超时");
  const second = queue.start(
    () => ({ result: new Promise<QueryResult>(() => undefined), cancel: vi.fn() }),
    5000
  );
  const rejectedSecond = expect(second.result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(100);
  await timedOut;
  expect(cancel).toHaveBeenCalledOnce();
  resolveLate(data);
  await vi.advanceTimersByTimeAsync(0);
  const thirdRun = vi.fn(() => ({ result: Promise.resolve(data), cancel: vi.fn() }));
  const third = queue.start(thirdRun, 5000);
  expect(thirdRun).not.toHaveBeenCalled();
  second.cancel();
  await rejectedSecond;
  expect(await third.result).toEqual(data);
});

it("队列有界，启动失败不会阻塞后面的查询", async () => {
  const queue = createQueryExecutionQueue(1, 1);
  const first = queue.start(
    () => ({ result: new Promise<QueryResult>(() => undefined), cancel: vi.fn() }),
    5000
  );
  const firstCancelled = expect(first.result).rejects.toMatchObject({ name: "AbortError" });
  const second = queue.start(() => {
    throw new Error("启动失败");
  }, 5000);
  const secondFailed = expect(second.result).rejects.toThrow("启动失败");
  await expect(
    queue.start(() => ({ result: Promise.resolve(data), cancel: vi.fn() }), 5000).result
  ).rejects.toThrow("过多");
  first.cancel();
  await Promise.all([firstCancelled, secondFailed]);
  expect(
    await queue.start(() => ({ result: Promise.resolve(data), cancel: vi.fn() }), 5000).result
  ).toEqual(data);
});
