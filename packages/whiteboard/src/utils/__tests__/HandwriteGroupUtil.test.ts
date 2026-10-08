import { describe, expect, it } from "vitest";
import { BoardElement } from "../../types";
import {
  applyHandwriteGroupIdPatch,
  collectGroupMembers,
  collectHandwriteGroupMembers,
  expandSelectionByGroup,
  expandSelectionByHandwriteGroup,
  getElementGroupId,
  getSelectedGroupBounds,
  getSharedHandwriteGroupId,
  isHandwriteElement,
  isMergeableHandwriteSelection,
  isPointInAnySelectedGroupBounds,
  isPointInGroupBounds,
} from "../HandwriteGroupUtil";

const createHandwrite = (id: string, groupId?: string): BoardElement => {
  const base: BoardElement = {
    id,
    type: "handwrite",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    points: [],
    outline: [],
    style: {},
  };

  if (!groupId) {
    return base;
  }

  return {
    ...base,
    groupId,
  };
};

describe("HandwriteGroupUtil", () => {
  it("should identify handwrite element", () => {
    expect(isHandwriteElement(createHandwrite("h1"))).toBe(true);
    expect(
      isHandwriteElement({
        id: "t1",
        type: "richtext",
      } as BoardElement)
    ).toBe(false);
  });

  it("should read normalized group id", () => {
    expect(getElementGroupId(createHandwrite("h1", " group-1 "))).toBe("group-1");
    expect(getElementGroupId(createHandwrite("h2"))).toBeNull();
  });

  it("should check mergeable handwrite selection", () => {
    expect(isMergeableHandwriteSelection([createHandwrite("h1"), createHandwrite("h2")])).toBe(
      true
    );

    expect(
      isMergeableHandwriteSelection([
        createHandwrite("h1"),
        {
          id: "t1",
          type: "richtext",
        } as BoardElement,
      ])
    ).toBe(false);
  });

  it("should get shared group id", () => {
    expect(
      getSharedHandwriteGroupId([createHandwrite("h1", "g-1"), createHandwrite("h2", "g-1")])
    ).toBe("g-1");

    expect(
      getSharedHandwriteGroupId([createHandwrite("h1", "g-1"), createHandwrite("h2", "g-2")])
    ).toBeNull();
  });

  it("should collect and expand selection by group", () => {
    const h1 = createHandwrite("h1", "g-1");
    const h2 = createHandwrite("h2", "g-1");
    const h3 = createHandwrite("h3", "g-2");
    const r1 = {
      id: "r1",
      type: "richtext",
      groupId: "g-1",
    } as BoardElement;
    const board = {
      children: [
        h1,
        {
          id: "frame-1",
          type: "frame",
          children: [h2],
        } as BoardElement,
        r1,
        h3,
      ],
    };

    const groupMembers = collectHandwriteGroupMembers(board as any, "g-1");
    expect(groupMembers.map(element => element.id).sort()).toEqual(["h1", "h2"]);

    const commonGroupMembers = collectGroupMembers(board as any, "g-1");
    expect(commonGroupMembers.map(element => element.id).sort()).toEqual(["h1", "h2", "r1"]);

    const expandedCommon = expandSelectionByGroup(board as any, [h1]);
    expect(expandedCommon.map(element => element.id).sort()).toEqual(["h1", "h2", "r1"]);

    const expanded = expandSelectionByHandwriteGroup(board as any, [h1]);
    expect(expanded.map(element => element.id).sort()).toEqual(["h1", "h2"]);
  });

  it("should patch group id for handwrite elements", () => {
    const h1 = createHandwrite("h1", "old-group");
    const h2 = createHandwrite("h2");

    const merged = applyHandwriteGroupIdPatch([h1, h2], "new-group");
    expect(merged.every(element => element.groupId === "new-group")).toBe(true);

    const split = applyHandwriteGroupIdPatch(merged, null);
    expect(split.every(element => !("groupId" in element))).toBe(true);
  });

  it("should calculate and hit-test selected group bounds", () => {
    const h1 = {
      ...createHandwrite("h1", "g-1"),
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    };
    const h2 = {
      ...createHandwrite("h2", "g-1"),
      x: 60,
      y: 30,
      width: 20,
      height: 10,
    };
    const h3 = {
      ...createHandwrite("h3", "g-2"),
      x: 200,
      y: 200,
      width: 10,
      height: 10,
    };
    const board = {
      children: [h1, h2, h3],
      getBounds: (element: BoardElement) => ({
        minX: element.x,
        minY: element.y,
        maxX: element.x + element.width,
        maxY: element.y + element.height,
      }),
    };

    const selected = [h1, h2];
    const groupBounds = getSelectedGroupBounds(board as any, selected);
    expect(groupBounds).toHaveLength(1);
    expect(groupBounds[0].groupId).toBe("g-1");
    expect(groupBounds[0].minX).toBe(10);
    expect(groupBounds[0].minY).toBe(20);
    expect(groupBounds[0].maxX).toBe(80);
    expect(groupBounds[0].maxY).toBe(60);

    expect(isPointInGroupBounds(groupBounds[0], 15, 25)).toBe(true);
    expect(isPointInGroupBounds(groupBounds[0], 5, 25)).toBe(false);
    expect(isPointInAnySelectedGroupBounds(board as any, selected, 70, 45)).toBe(true);
    expect(isPointInAnySelectedGroupBounds(board as any, selected, 100, 100)).toBe(false);
  });
});
