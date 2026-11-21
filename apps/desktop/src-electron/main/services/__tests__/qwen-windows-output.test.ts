import { describe, expect, it } from "vitest";
import { vulkanDevices, windowsAdapterReport } from "../qwen/gpu-inventory";
import { nativeSubtitles } from "../qwen/windows-output";

describe("Windows Qwen 对齐输出", () => {
  it("逐词时间从采样点换算为毫秒，字幕保留中英混排的空格和标点", () => {
    const result = nativeSubtitles(
      [
        { word: "用", start_sample: 0, end_sample: 1600 },
        { word: "Qwen", start_sample: 1920, end_sample: 6400 },
        { word: "转录", start_sample: 6720, end_sample: 9600 },
      ],
      "用 Qwen 转录。",
      0.57
    );
    expect(result.segments).toEqual([{ text: "用 Qwen 转录。", start: 0, end: 570 }]);
    expect(result.wordSegments[1]).toEqual({ text: "Qwen", start: 120, end: 400 });
  });
  it("有正文但时间缺失或反向时拒绝生成可点击字幕", () => {
    expect(() => nativeSubtitles([], "你好", 1)).toThrow();
    expect(() =>
      nativeSubtitles([{ word: "你好", start_sample: 8000, end_sample: 1000 }], "你好", 1)
    ).toThrow();
  });
});

it("混合显卡优先选 NVIDIA 的 Vulkan 设备索引，只有 CPU 时返回不可用", () => {
  const cpu = { backend: "cpu", index: 0, type: "cpu", description: "CPU" };
  const integrated = { backend: "vulkan", index: 0, type: "igpu", description: "Intel Graphics" };
  const discrete = { backend: "vulkan", index: 1, type: "gpu", description: "NVIDIA GeForce RTX" };
  expect(vulkanDevices({ devices: [cpu, integrated, discrete] })[0]?.index).toBe(1);
  expect(vulkanDevices({ devices: [cpu] })).toEqual([]);
});

it("AMD 独显和 Intel 核显都能参与 Vulkan 转录，软件适配器不参与", () => {
  const available = vulkanDevices({
    devices: [
      { backend: "vulkan", type: "igpu", index: 0, description: "Intel Iris Xe" },
      { backend: "vulkan", type: "gpu", index: 1, description: "AMD Radeon RX 6600" },
      { backend: "vulkan", type: "gpu", index: 2, description: "Microsoft Basic Render Driver" },
    ],
  });
  expect(available.map(device => device.description)).toEqual([
    "AMD Radeon RX 6600",
    "Intel Iris Xe",
  ]);
});

it.each([
  ["1002", "AMD Radeon"],
  ["8086", "Intel Arc"],
  ["10DE", "NVIDIA GeForce"],
])("安装前识别 %s 显卡，只有驱动正常且存在 Vulkan 加载器才建议尝试 GPU", (Vendor, Name) => {
  const adapter = { Name, Vendor, ConfigManagerErrorCode: 0, InfFilename: "oem123.inf" };
  expect(windowsAdapterReport([adapter], true)).toEqual({ state: "candidate", names: [Name] });
  expect(windowsAdapterReport([adapter], false).state).toBe("cpu");
  expect(windowsAdapterReport([{ ...adapter, ConfigManagerErrorCode: 22 }], true).state).toBe(
    "cpu"
  );
  expect(windowsAdapterReport([{ ...adapter, InfFilename: "display.inf" }], true).state).toBe(
    "cpu"
  );
});
