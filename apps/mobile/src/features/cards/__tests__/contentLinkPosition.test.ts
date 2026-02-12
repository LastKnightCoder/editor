import { describe, expect, it } from "vitest";
import { calculateContentLinkPopoverPosition } from "../contentLinkPosition";

describe("contentLinkPosition", () => {
  it("空间充足时优先放在下方", () => {
    const position = calculateContentLinkPopoverPosition({
      anchorRect: {
        top: 100,
        bottom: 120,
        left: 120,
        width: 80,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      popoverWidth: 300,
      popoverHeight: 180,
    });

    expect(position.placement).toBe("bottom");
    expect(position.top).toBe(128);
  });

  it("下方空间不足时翻转到上方", () => {
    const position = calculateContentLinkPopoverPosition({
      anchorRect: {
        top: 700,
        bottom: 720,
        left: 120,
        width: 80,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      popoverWidth: 300,
      popoverHeight: 180,
    });

    expect(position.placement).toBe("top");
    expect(position.top).toBe(512);
  });

  it("靠近左边界时会进行水平夹紧", () => {
    const position = calculateContentLinkPopoverPosition({
      anchorRect: {
        top: 300,
        bottom: 320,
        left: 4,
        width: 40,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      popoverWidth: 300,
      popoverHeight: 180,
      gap: 10,
    });

    expect(position.left).toBe(10);
  });

  it("靠近右边界时会进行水平夹紧", () => {
    const position = calculateContentLinkPopoverPosition({
      anchorRect: {
        top: 300,
        bottom: 320,
        left: 360,
        width: 30,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      popoverWidth: 300,
      popoverHeight: 180,
      gap: 10,
    });

    expect(position.left).toBe(80);
  });
});
