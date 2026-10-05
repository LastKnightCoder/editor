import { describe, expect, it } from "vitest";
import { placePreview } from "../core/previewPlacement";

const viewport = { width: 1200, height: 800 };
const panel = { width: 420, maxHeight: 360 };
const boxAt = (x: number, y: number) => ({
  left: x - 20,
  right: x + 20,
  top: y - 6,
  bottom: y + 20,
});

describe("placePreview", () => {
  it("下方放得下就放下方", () => {
    expect(placePreview(boxAt(600, 100), panel, viewport)).toEqual({
      placement: "bottom-start",
      maxHeight: 360,
    });
  });

  it("下方放不下、上方放得下就翻到上方", () => {
    expect(placePreview(boxAt(600, 700), panel, viewport).placement).toBe("top-start");
  });

  it("上下都放不下时改放左右，不压住节点", () => {
    const short = { width: 1200, height: 700 };
    expect(placePreview(boxAt(300, 350), panel, short).placement).toBe("right-start");
    expect(placePreview(boxAt(1000, 350), panel, short).placement).toBe("left-start");
  });

  it("四面都放不下时放上下里空间大的一侧，并收矮面板", () => {
    const small = { width: 600, height: 600 };
    const place = placePreview(boxAt(300, 250), panel, small);
    expect(place.placement).toBe("bottom-start");
    // 节点底边 270，下方空间 600 - 270 - 16 = 314，减去边框
    expect(place.maxHeight).toBe(312);
  });
});
