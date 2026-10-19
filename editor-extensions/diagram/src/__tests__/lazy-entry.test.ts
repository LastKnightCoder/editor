import { describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ mermaid: vi.fn(), plantuml: vi.fn() }));
vi.mock("mermaid", () => {
  loads.mermaid();
  return { default: {} };
});
vi.mock("plantuml-encoder", () => {
  loads.plantuml();
  return { default: {} };
});

describe("扩展声明保持渲染懒加载", () => {
  it("只组装 kit 声明时不加载图表渲染依赖", { timeout: 20_000 }, async () => {
    const { diagramExtensions } = await import("../index");
    expect(diagramExtensions.map(extension => extension.id)).toEqual([
      "tau.mermaid",
      "tau.plantuml",
    ]);
    expect(loads.mermaid).not.toHaveBeenCalled();
    expect(loads.plantuml).not.toHaveBeenCalled();
  });
});
