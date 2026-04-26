import { describe, expect, it } from "vitest";

import {
  runSubAgentResearch,
  type SubAgentResearchTask,
} from "../subagentResearch";

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("subagentResearch", () => {
  it("按 maxConcurrency 并发执行多个调研任务并聚合结果", async () => {
    let running = 0;
    let peakRunning = 0;
    const tasks: SubAgentResearchTask[] = [
      { id: "a", title: "A", prompt: "调研 A" },
      { id: "b", title: "B", prompt: "调研 B" },
      { id: "c", title: "C", prompt: "调研 C" },
    ];

    const result = await runSubAgentResearch({
      tasks,
      maxConcurrency: 2,
      runTask: async ({ task }) => {
        running += 1;
        peakRunning = Math.max(peakRunning, running);
        await flushMicrotasks();
        running -= 1;
        return {
          answer: `${task.title} done`,
        };
      },
    });

    expect(peakRunning).toBe(2);
    expect(result.status).toBe("success");
    expect(result.tasks.map((task) => task.answer)).toEqual([
      "A done",
      "B done",
      "C done",
    ]);
  });

  it("父级中断时应取消运行中和等待中的 SubAgent", async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const tasks: SubAgentResearchTask[] = [
      { id: "a", title: "A", prompt: "调研 A" },
      { id: "b", title: "B", prompt: "调研 B" },
    ];

    const resultPromise = runSubAgentResearch({
      tasks,
      maxConcurrency: 1,
      signal: controller.signal,
      runTask: async ({ task, signal }) => {
        started.push(task.id);
        return await new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("已取消", "AbortError"));
          });
        });
      },
    });

    await flushMicrotasks();
    controller.abort();

    const result = await resultPromise;
    expect(started).toEqual(["a"]);
    expect(result.status).toBe("cancelled");
    expect(result.tasks.map((task) => task.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
  });
});
