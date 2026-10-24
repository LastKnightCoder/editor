// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WebContents } from "electron";
import { ASRTaskRegistry } from "../asr-tasks";

const owner = (id: number) =>
  Object.assign(new EventEmitter(), { id, isDestroyed: () => false }) as unknown as WebContents;
const untilCancelled = (signal: AbortSignal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
describe("ASR 任务归属", () => {
  it("同窗口多个任务独立取消，其他窗口不能取消", async () => {
    const tasks = new ASRTaskRegistry();
    const window = owner(1);
    let firstSignal!: AbortSignal;
    let secondSignal!: AbortSignal;
    const first = tasks.run(window, "first", signal => {
      firstSignal = signal;
      return untilCancelled(signal);
    });
    const second = tasks.run(window, "second", signal => {
      secondSignal = signal;
      return untilCancelled(signal);
    });
    void first.catch(() => undefined);
    void second.catch(() => undefined);
    tasks.cancel(2, "first");
    expect(firstSignal.aborted).toBe(false);
    tasks.cancel(1, "first");
    await expect(first).rejects.toMatchObject({ code: "cancelled" });
    expect(secondSignal.aborted).toBe(false);
    tasks.cancelAll();
    await expect(second).rejects.toMatchObject({ code: "cancelled" });
    expect(window.listenerCount("destroyed")).toBe(0);
  });
  it("重载或窗口销毁取消任务，迟到成功不能交付", async () => {
    const tasks = new ASRTaskRegistry();
    const window = owner(1);
    let resolve!: (text: string) => void;
    const pending = tasks.run(
      window,
      "id",
      () =>
        new Promise<string>(yes => {
          resolve = yes;
        })
    );
    await expect(tasks.run(window, "id", async () => "冲突")).rejects.toMatchObject({
      code: "busy",
    });
    window.emit("did-start-navigation", {}, "about:blank", false, true);
    resolve("迟到");
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    const next = tasks.run(window, "next", untilCancelled);
    window.emit("destroyed");
    await expect(next).rejects.toMatchObject({ code: "cancelled" });
  });
});
