import { describe, expect, it } from "vitest";
import ViewportUtil from "../ViewportUtil";

const viewPort = {
  minX: 100,
  minY: 100,
  width: 500,
  height: 400,
  zoom: 1,
};

describe("ViewportUtil", () => {
  it("handwrite should use x/y/width/height instead of normalized points", () => {
    const handwrite = {
      id: "handwrite-1",
      type: "handwrite",
      x: 220,
      y: 180,
      width: 120,
      height: 80,
      points: [
        { x: 0.1, y: 0.2, pressure: 0.5 },
        { x: 0.8, y: 0.7, pressure: 0.6 },
      ],
      outline: [],
      style: {},
    };

    const visible = ViewportUtil.isElementInViewport(handwrite, viewPort, 0);
    expect(visible).toBe(true);
  });

  it("handwrite outside viewport should not be visible", () => {
    const handwrite = {
      id: "handwrite-2",
      type: "handwrite",
      x: 2000,
      y: 2000,
      width: 120,
      height: 80,
      points: [
        { x: 0.2, y: 0.3, pressure: 0.4 },
        { x: 0.7, y: 0.9, pressure: 0.7 },
      ],
      outline: [],
      style: {},
    };

    const visible = ViewportUtil.isElementInViewport(handwrite, viewPort, 0);
    expect(visible).toBe(false);
  });

  it("arrow should continue using points bounding box", () => {
    const arrow = {
      id: "arrow-1",
      type: "arrow",
      x: 3000,
      y: 3000,
      width: 10,
      height: 10,
      lineType: "straight",
      source: { marker: "none" },
      target: { marker: "arrow" },
      points: [
        { x: 150, y: 180 },
        { x: 260, y: 260 },
      ],
      lineWidth: 2,
    };

    const visible = ViewportUtil.isElementInViewport(arrow, viewPort, 0);
    expect(visible).toBe(true);
  });

  it("arrow without points should be treated as invisible", () => {
    const arrow = {
      id: "arrow-2",
      type: "arrow",
      x: 120,
      y: 140,
      width: 10,
      height: 10,
      lineType: "straight",
      source: { marker: "none" },
      target: { marker: "arrow" },
      points: [],
      lineWidth: 2,
    };

    const visible = ViewportUtil.isElementInViewport(arrow, viewPort, 0);
    expect(visible).toBe(false);
  });
});
