import { describe, expect, it } from "vitest";
import type { BoardElement } from "@/components/WhiteBoard/types";
import { buildSchematic, parseFill } from "../schematic";

const opts = { aspect: 16 / 10, dark: false };

const mind = (patch: Record<string, unknown>, children: unknown[] = []) => ({
  id: String(Math.random()),
  type: "mind-node",
  width: 80,
  height: 40,
  level: 1,
  direction: "right",
  children,
  ...patch,
});

describe("buildSchematic", () => {
  it("空画布返回 null", () => {
    expect(buildSchematic([], opts)).toBeNull();
    expect(buildSchematic(undefined, opts)).toBeNull();
  });

  it("视口按卡片比例、内容居中", () => {
    const s = buildSchematic(
      [{ id: "a", type: "richtext", x: 0, y: 0, width: 2000, height: 200 }] as BoardElement[],
      opts
    )!;
    expect(s.viewBox.w / s.viewBox.h).toBeCloseTo(16 / 10);
    expect(s.viewBox.x + s.viewBox.w / 2).toBeCloseTo(1000);
    expect(s.viewBox.y + s.viewBox.h / 2).toBeCloseTo(100);
  });

  it("思维导图折叠一侧的子树不参与范围（旧坐标不会把示意图撑散）", () => {
    const far = mind({ x: 5000, y: 5000, level: 2 });
    const root = mind({ x: 0, y: 0, isRightFold: true }, [far]);
    const s = buildSchematic([root] as unknown as BoardElement[], opts)!;
    expect(s.viewBox.x + s.viewBox.w).toBeLessThan(2000);
    expect(s.viewBox.y + s.viewBox.h).toBeLessThan(2000);
  });

  it("展开的子节点画出连线与节点", () => {
    const child = mind({ x: 200, y: 0, level: 2 });
    const root = mind({ x: 0, y: 0 }, [child]);
    const s = buildSchematic([root] as unknown as BoardElement[], opts)!;
    expect(s.shapes.filter(shape => shape.kind === "path")).toHaveLength(1);
  });
});

describe("parseFill", () => {
  it("CSS 线性渐变解析成角度 + 色标，纯色原样返回", () => {
    expect(parseFill("#fff")).toBe("#fff");
    expect(parseFill("linear-gradient(310.93deg, #D6EBFF 6.86%, rgba(1, 2, 3, 0.5) 100%)")).toEqual(
      {
        angle: 310.93,
        stops: [
          { color: "#D6EBFF", offset: expect.closeTo(0.0686) },
          { color: "rgba(1, 2, 3, 0.5)", offset: 1 },
        ],
      }
    );
  });
});
