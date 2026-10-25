// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createNodeDocument, readNodeDocument } from "@tau/collaboration";
import { convertLegacyContent } from "@tau/editor-collab";

async function catalog() {
  const entries = await Promise.all([
    prepareContentContract("tau.paragraph", { type: "paragraph", dataVersion: 1, kind: "block" }),
    prepareContentContract("tau.code-block", {
      type: "code-block",
      dataVersion: 2,
      kind: "block",
      isVoid: true,
    }),
    prepareContentContract("tau.code-block", {
      type: "code-step",
      dataVersion: 1,
      kind: "block",
      collaboration: { textFields: ["code"] },
    }),
    prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    }),
    prepareContentContract("tau.list-item", { type: "list-item", dataVersion: 1, kind: "block" }),
    prepareContentContract("tau.tabs", { type: "tabs", dataVersion: 1, kind: "block" }),
    prepareContentContract("plugin.example", { type: "example", dataVersion: 1, kind: "block" }),
  ]);
  return Object.fromEntries(entries.map(entry => [entry.id, entry.contract]));
}
const reference = { sourceId: "library", kind: "whiteboard-content" as const, entityId: "board" };

describe("隔离旧正文转换", () => {
  it("旧折叠列表恢复隐藏正文，保留当前首段并将折叠移到本机", async () => {
    const converted = await convertLegacyContent(
      [
        {
          type: "list-item",
          isFold: true,
          allContent: [
            { type: "paragraph", children: [{ text: "过时首段" }] },
            { type: "paragraph", children: [{ text: "隐藏正文" }] },
          ],
          children: [{ type: "paragraph", children: [{ text: "当前首段" }] }],
        },
      ],
      await catalog(),
      { shared: false, resolveEntity: () => null }
    );
    expect(converted.content[0].children).toMatchObject([
      { children: [{ text: "当前首段" }] },
      { children: [{ text: "隐藏正文" }] },
    ]);
    expect(converted.content[0]).not.toHaveProperty("allContent");
    expect(converted.content[0]).not.toHaveProperty("isFold");
    expect(converted.views).toEqual([expect.objectContaining({ value: { isFold: true } })]);
  });

  it("代码步骤、冲突根源码、视图字段、实体与第三方同名字段全部保留", async () => {
    const input = [
      {
        type: "code-block",
        code: "另一个根源码",
        isFold: true,
        magicMove: {
          v: 1,
          activeStep: 0,
          steps: [
            { id: "step", code: "步骤一" },
            { id: "step", code: "步骤二" },
          ],
        },
        children: [{ text: "" }],
      },
      {
        type: "tabs",
        activeKey: "tab-a",
        children: [{ type: "paragraph", children: [{ text: "正文" }] }],
      },
      { type: "whiteboard", whiteBoardContentId: 42, children: [{ text: "" }] },
      { type: "example", svg: "用户画作", isFold: true, children: [{ text: "第三方内容" }] },
    ];
    const converted = await convertLegacyContent(input, await catalog(), {
      shared: false,
      resolveEntity: () => reference,
    });
    expect(converted.content[0]).toMatchObject({
      recoveredRootSource: "另一个根源码",
      children: [{ code: "步骤一" }, { code: "步骤二" }],
    });
    expect(new Set(converted.content[0].children!.map(node => node.collabId)).size).toBe(2);
    expect(converted.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: expect.objectContaining({ isFold: true }) }),
        expect.objectContaining({ value: { activeKey: "tab-a" } }),
      ])
    );
    expect(converted.content[2]).toMatchObject({ entityRef: reference });
    expect(converted.content[2]).not.toHaveProperty("whiteBoardContentId");
    expect(converted.content[3]).toMatchObject({ type: "tau.recovery", original: input[3] });
    const doc = await createNodeDocument(
      { documentId: "document", baselineId: "baseline", epoch: 1 },
      { title: "旧文档", bannerBg: "", bannerPosition: "center", content: converted.content },
      converted.contracts
    );
    try {
      expect(readNodeDocument(doc).content).toMatchObject(converted.content);
    } finally {
      doc.destroy();
    }
    expect(input[0]).toHaveProperty("isFold", true);
  });

  it("共享转换默认不公开私有真身；明确提供后按原稳定关联恢复", async () => {
    const placeholder = {
      type: "collaboration-placeholder",
      collabId: "private",
      label: "whiteboard",
      children: [{ text: "" }],
    };
    const original = {
      type: "whiteboard",
      whiteBoardContentId: 42,
      secret: "未公开",
      children: [{ text: "" }],
    };
    const options = {
      shared: true,
      privateNodes: new Map([["private", original]]),
      resolveEntity: () => reference,
    };
    const retained = await convertLegacyContent([placeholder], await catalog(), options);
    expect(JSON.stringify(retained)).not.toContain("未公开");
    expect(retained.content[0]).toMatchObject({ reason: "private-body-unavailable" });
    const published = await convertLegacyContent([placeholder], await catalog(), {
      ...options,
      publishPrivate: new Set(["private"]),
    });
    expect(published.content[0]).toMatchObject({
      type: "whiteboard",
      entityRef: reference,
      secret: "未公开",
      collabId: "private",
    });
    const duplicates = await convertLegacyContent([placeholder, placeholder], await catalog(), {
      ...options,
      publishPrivate: new Set(["private"]),
    });
    expect(JSON.stringify(duplicates)).not.toContain("未公开");
  });

  it("损坏源码和失去实体的节点保留原文，不能冒充完整恢复", async () => {
    const input = [
      { type: "code-block", code: { bad: true }, children: [{ text: "" }] },
      { type: "whiteboard", whiteBoardContentId: 42, children: [{ text: "" }] },
    ];
    const converted = await convertLegacyContent(input, await catalog(), {
      shared: false,
      resolveEntity: () => null,
    });
    expect(converted.content.map(node => node.original)).toEqual(input);
    expect(converted.issues.map(issue => issue.reason)).toEqual([
      "invalid-legacy-code",
      "missing-entity",
    ]);
  });
});
