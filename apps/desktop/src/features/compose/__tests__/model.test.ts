import { describe, expect, it } from "vitest";
import type { BoardElement } from "@tau/whiteboard";
import {
  COMPOSE_ORIGIN,
  boundsOf,
  citedKeys,
  collectDocuments,
  layoutGather,
  removedGatheredKeys,
} from "../model";

const doc = (id: string, kind: string, refId: number, gathered = false) =>
  ({
    id,
    type: "document",
    entityRef: { kind, id: refId },
    title: id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...(gathered ? { composeOrigin: COMPOSE_ORIGIN } : {}),
  }) as unknown as BoardElement;

describe("compose model", () => {
  it("收集白板上的文档卡，包括 frame 里的", () => {
    const frame = {
      id: "f",
      type: "frame",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      children: [doc("b", "article", 2, true)],
    };
    const docs = collectDocuments([doc("a", "card", 1), frame as unknown as BoardElement]);
    expect(docs.map(item => [item.key, item.gathered])).toEqual([
      ["card:1", false],
      ["article:2", true],
    ]);
  });

  it("只有召集来的、且画布上已没有同一份时才算移走", () => {
    const before = collectDocuments([
      doc("a", "card", 1, true),
      doc("b", "card", 2, true),
      doc("c", "card", 3),
    ]);
    const after = collectDocuments([doc("b2", "card", 2)]);
    expect(removedGatheredKeys(before, after)).toEqual(["card:1"]);
  });

  it("正文里的 content-link 归一成实体 key", () => {
    const content = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "见" },
          {
            type: "content-link",
            contentType: "project_item",
            refId: 7,
            contentId: 70,
            contentTitle: "x",
            children: [{ type: "formatted", text: "x" }],
          },
        ],
      },
    ];
    expect([...citedKeys(content as never)]).toEqual(["project-item:7"]);
  });

  it("每组一个 frame、组内两列，接在已有内容右侧", () => {
    const frames = layoutGather(
      [
        {
          name: "机制",
          items: [1, 2, 3].map(id => ({
            ref: { kind: "card" as const, id },
            contentId: id,
            title: `t${id}`,
            why: "w",
            heading: "",
            block: 0,
          })),
        },
        { name: "空", items: [] },
      ],
      boundsOf([doc("a", "card", 9)])
    );
    expect(frames).toHaveLength(1);
    const [frame] = frames;
    expect(frame.title).toBe("机制");
    expect(frame.x).toBeGreaterThan(100);
    expect(frame.children).toHaveLength(3);
    const [first, second, third] = frame.children as Array<
      BoardElement & { composeOrigin?: string }
    >;
    expect(first.y).toBe(second.y);
    expect(third.x).toBe(first.x);
    expect(third.y).toBeGreaterThan(first.y);
    expect(first.composeOrigin).toBe(COMPOSE_ORIGIN);
    // 子元素都在 frame 里
    for (const child of frame.children) {
      expect(child.x + child.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(child.y + child.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it("已关联的一组不记召集来源（删掉不算「不要」），多份时排成方阵", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      ref: { kind: "card" as const, id: index + 1 },
      contentId: index + 1,
      title: `t${index}`,
      why: "",
      heading: "",
      block: 0,
    }));
    const [frame] = layoutGather([{ name: "已关联", items }], null, { gathered: false });
    const children = frame.children as Array<BoardElement & { composeOrigin?: string }>;
    expect(children.every(child => child.composeOrigin === undefined)).toBe(true);
    expect(new Set(children.map(child => child.x)).size).toBe(3);
    expect(collectDocuments([frame]).every(doc => !doc.gathered)).toBe(true);
  });
});
