import { describe, expect, it } from "vitest";
import type { IConfigItem } from "@tau/editor/src";
import {
  buildCompactLayoutItems,
  COMPACT_MORE_GROUP_ID,
  COMPACT_TEXT_STYLE_GROUP_ID,
} from "@tau/editor/src/components/HoveringToolbar/compactLayout";
import { calculateFloatingPosition } from "@tau/editor/src/components/HoveringToolbar/floatingPosition";

function createConfig(id: string, order: number): IConfigItem {
  return {
    id,
    order,
    element: (() => null) as IConfigItem["element"],
  };
}

describe("HoveringToolbar floatingPosition", () => {
  it("空间充足时优先放在下方", () => {
    const position = calculateFloatingPosition({
      anchorRect: {
        top: 120,
        bottom: 140,
        left: 100,
        width: 60,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      floatingWidth: 180,
      floatingHeight: 120,
    });

    expect(position.placement).toBe("bottom");
    expect(position.top).toBe(148);
  });

  it("下方空间不足时翻转到上方", () => {
    const position = calculateFloatingPosition({
      anchorRect: {
        top: 760,
        bottom: 780,
        left: 120,
        width: 60,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      floatingWidth: 220,
      floatingHeight: 140,
    });

    expect(position.placement).toBe("top");
    expect(position.top).toBe(612);
  });

  it("水平方向会做左右夹紧", () => {
    const leftPinned = calculateFloatingPosition({
      anchorRect: {
        top: 220,
        bottom: 240,
        left: 0,
        width: 20,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      floatingWidth: 260,
      floatingHeight: 120,
      gap: 10,
    });
    const rightPinned = calculateFloatingPosition({
      anchorRect: {
        top: 220,
        bottom: 240,
        left: 375,
        width: 16,
      },
      viewportWidth: 390,
      viewportHeight: 844,
      floatingWidth: 260,
      floatingHeight: 120,
      gap: 10,
    });

    expect(leftPinned.left).toBe(10);
    expect(rightPinned.left).toBe(120);
  });

  it("垂直方向会在上下边界内夹紧", () => {
    const position = calculateFloatingPosition({
      anchorRect: {
        top: 12,
        bottom: 24,
        left: 120,
        width: 60,
      },
      viewportWidth: 390,
      viewportHeight: 320,
      floatingWidth: 220,
      floatingHeight: 300,
      gap: 8,
      preferredPlacement: "top",
    });

    expect(position.top).toBe(12);
  });
});

describe("HoveringToolbar compactLayout", () => {
  it("compact 下应将 kbd 并入文本样式组，并把 comment/content-link 收敛到 more", () => {
    const sortedConfigs: IConfigItem[] = [
      createConfig("bold", 1),
      createConfig("italic", 2),
      createConfig("underline", 3),
      createConfig("strikethrough", 4),
      createConfig("comment", 5),
      createConfig("kbd", 5.5),
      createConfig("link", 6),
      createConfig("content-link", 7),
      createConfig("color", 10),
    ];

    const compactItems = buildCompactLayoutItems(sortedConfigs);
    const ids = compactItems.map((item) =>
      item.kind === "item" ? item.config.id : item.id,
    );

    expect(ids).toEqual([
      COMPACT_TEXT_STYLE_GROUP_ID,
      "underline",
      "link",
      "color",
      COMPACT_MORE_GROUP_ID,
    ]);

    const textGroup = compactItems.find(
      (item) =>
        item.kind === "group" && item.id === COMPACT_TEXT_STYLE_GROUP_ID,
    );
    const moreGroup = compactItems.find(
      (item) => item.kind === "group" && item.id === COMPACT_MORE_GROUP_ID,
    );

    expect(
      textGroup && textGroup.kind === "group"
        ? textGroup.items.map((item) => item.id)
        : [],
    ).toEqual(["bold", "italic", "strikethrough", "kbd"]);
    expect(
      moreGroup && moreGroup.kind === "group"
        ? moreGroup.items.map((item) => item.id)
        : [],
    ).toEqual(["comment", "content-link"]);
  });

  it("无可分组项时仅保留原普通项", () => {
    const sortedConfigs: IConfigItem[] = [
      createConfig("underline", 3),
      createConfig("link", 6),
      createConfig("color", 10),
    ];

    const compactItems = buildCompactLayoutItems(sortedConfigs);

    expect(compactItems.every((item) => item.kind === "item")).toBe(true);
    expect(
      compactItems.map((item) =>
        item.kind === "item" ? item.config.id : item.id,
      ),
    ).toEqual(["underline", "link", "color"]);
  });
});
