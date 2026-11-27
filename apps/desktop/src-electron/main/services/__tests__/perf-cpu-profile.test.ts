// @vitest-environment node
import { expect, it } from "vitest";
import { cpuAssetUrl, prepareCpuProfile } from "../perf-cpu-profile";
import type { CpuProfile } from "../../../../shared/perf-cpu";

const profile = (): CpuProfile => ({
  startTime: 1000,
  endTime: 61_000,
  nodes: [
    {
      id: 1,
      callFrame: {
        functionName: "(root)",
        scriptId: "0",
        url: "",
        lineNumber: -1,
        columnNumber: -1,
      },
      children: [2],
    },
    {
      id: 2,
      callFrame: {
        functionName: "convert",
        scriptId: "1",
        url: "file:///private/app/dist/assets/main.js?private-query",
        lineNumber: 2,
        columnNumber: 4,
      },
      children: [3],
    },
    {
      id: 3,
      callFrame: {
        functionName: "private-function",
        scriptId: "2",
        url: "file:///private/user-script.js",
        lineNumber: 3,
        columnNumber: 5,
      },
    },
  ],
  samples: [2, 3, 2],
  timeDeltas: [10_000, 20_000, 30_000],
});

it("按真实样本权重计算 self/total，清除机器路径、参数和外部函数身份", () => {
  const result = prepareCpuProfile(profile(), "/private/app");
  expect(result.summary.top.find(row => row.frame.functionName === "convert")).toMatchObject({
    selfMs: 40,
    totalMs: 60,
  });
  expect(result.profile?.nodes.find(node => node.id === 2)?.callFrame.url).toBe(
    "renderer/assets/main.js"
  );
  expect(result.profile?.nodes[0].id).toBe(1);
  expect(result.profile?.nodes.find(node => node.id === 3)?.callFrame.functionName).toBe(
    "(external)"
  );
  expect(JSON.stringify(result)).not.toContain("private-");
  expect(JSON.stringify(result)).not.toContain("/private/");
  expect(
    cpuAssetUrl("file:///C:/Users/person/Tau/dist-electron/main/index.js", "C:\\Users\\person\\Tau")
  ).toBe("main/index.js");
});

it("延迟停止时只保留采样窗口，显式报告省略且 profile 引用仍完整", () => {
  const raw = profile();
  raw.endTime = 10_001_000;
  raw.samples = Array.from({ length: 1100 }, () => 3);
  raw.timeDeltas = raw.samples.map(() => 10_000);
  const result = prepareCpuProfile(raw, "/private/app");
  expect(result.actualDurationMs).toBe(10_000);
  expect(result.summary.sampledMs).toBe(5000);
  expect(result.summary.omittedSamples).toBe(600);
  const ids = new Set(result.profile?.nodes.map(node => node.id));
  expect(result.profile?.samples?.every(id => ids.has(id))).toBe(true);
  expect(result.profile?.nodes.every(node => node.children?.every(id => ids.has(id)) ?? true)).toBe(
    true
  );
});
