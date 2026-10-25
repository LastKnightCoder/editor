import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CONTENT_CONTRACT_LIMITS,
  CONTENT_CONTRACT_VERSION,
  prepareContentContract,
  prepareWhiteboardContract,
  normalizeWhiteboardContract,
  validateContentContracts,
  type WhiteboardContractDefinition,
} from "@tau/db-schema/content-contracts";
import { CONTENT_RESOURCE_LIMITS } from "@tau/db-schema/content-resources";
import { NodeTree } from "./node-tree";
import { WhiteboardModel } from "./whiteboard-model";
import { NODE_TREE_LIMITS, WHITEBOARD_LIMITS, assertWhiteboardBudget } from "./model-limits";
import { assertWhiteboardDataPatch } from "./whiteboard-contract";
import * as Y from "yjs";

const definition: WhiteboardContractDefinition = {
  type: "example.diagram",
  dataVersion: 1,
  collaboration: { textFields: ["source"] },
  resources: [{ path: "cover", kind: "image" }],
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

describe("W1 白板契约与预算冻结", () => {
  it("独立 data 允许普通业务字段，源码 text 可协作且不改外层身份", async () => {
    const prepared = await prepareWhiteboardContract("example", {
      type: "example.payload",
      dataVersion: 1,
      collaboration: { textFields: ["text"] },
      resources: [{ path: "data.url", kind: "image" }],
    });
    const doc = new Y.Doc(),
      peerDoc = new Y.Doc();
    const board = new WhiteboardModel(doc),
      peer = new WhiteboardModel(peerDoc);
    try {
      await board.installContracts({ [prepared.id]: prepared.contract });
      board.submit(
        [
          { type: "create_page", id: "page", title: "页" },
          {
            type: "create",
            id: "element",
            contractId: prepared.id,
            parent: { kind: "page", id: "page" },
            geometry: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
            data: {
              id: "业务身份",
              type: "业务类型",
              geometry: "业务几何",
              children: [],
              data: { url: "https://example.com/a.png" },
              text: "源码",
            },
          },
        ],
        null
      );
      board.submit(
        [
          { type: "set_data", id: "element", patch: { id: "修改业务身份", children: [1] } },
          {
            type: "edit_text",
            id: "element",
            field: "text",
            edit: { offset: 2, remove: 0, text: "增量" },
          },
        ],
        null
      );
      await peer.receive(Y.encodeStateAsUpdate(doc));
      const value = peer.read().pages[0].children[0];
      expect(value).toMatchObject({
        id: "element",
        data: { id: "修改业务身份", type: "业务类型", text: "源码增量", children: [1] },
      });
      expect(value.geometry.width).toBe(10);
      expect(() =>
        board.submit([{ type: "set_data", id: "element", patch: { text: "绕过句柄" } }], null)
      ).toThrow("受保护");
      expect(() =>
        assertWhiteboardDataPatch(prepared.contract, JSON.parse('{"__proto__":{}}'))
      ).toThrow();
    } finally {
      board.dispose();
      peer.dispose();
      doc.destroy();
      peerDoc.destroy();
    }
  });
  it("格式、摘要和准入额度与独立冻结样例一致", async () => {
    const frozen = JSON.parse(
      readFileSync(
        new URL("../../db-schema/fixtures/whiteboard-w1-v1.json", import.meta.url),
        "utf8"
      )
    );
    expect(await prepareWhiteboardContract("example", definition)).toEqual(frozen.whiteboard);
    expect(await prepareContentContract("example", { ...definition, kind: "block" })).toEqual(
      frozen.editor
    );
    expect(CONTENT_CONTRACT_LIMITS).toEqual(frozen.limits.contracts);
    expect(CONTENT_RESOURCE_LIMITS).toEqual(frozen.limits.resources);
    expect(NODE_TREE_LIMITS).toEqual(frozen.limits.nodeTree);
    expect(WHITEBOARD_LIMITS).toEqual(frozen.limits.whiteboard);
  });

  it("null 和稀疏声明不能冒充缺省值，补丁深度和 UTF-8 字节边界明确", () => {
    for (const invalid of [
      { ...definition, structure: null },
      { ...definition, resources: null },
      { ...definition, structure: { geometry: null } },
      { ...definition, collaboration: { textFields: Array(1) } },
      { ...definition, structure: { joins: Array(1) } },
    ])
      expect(() => normalizeWhiteboardContract("example", invalid as never)).toThrow();
    const contract = normalizeWhiteboardContract("example", definition);
    let deep: unknown = null;
    for (let index = 0; index < WHITEBOARD_LIMITS.payloadDepth; index++) deep = { child: deep };
    expect(() => assertWhiteboardDataPatch(contract, deep)).not.toThrow();
    expect(() => assertWhiteboardDataPatch(contract, { child: deep })).toThrow("层级");
    expect(() => assertWhiteboardDataPatch(contract, { values: Array(1) })).toThrow();
    expect(() =>
      assertWhiteboardDataPatch(contract, { title: "字".repeat(WHITEBOARD_LIMITS.patchBytes / 2) })
    ).toThrow("预算");
  });

  it("编辑器与白板共享格式和摘要算法，领域隔离，同类型同版本可共存", async () => {
    const editor = await prepareContentContract("example", { ...definition, kind: "block" });
    const board = await prepareWhiteboardContract("example", definition);
    expect(CONTENT_CONTRACT_VERSION).toBe(2);
    expect(editor.contract.domain).toBe("editor-node");
    expect(board.contract.domain).toBe("whiteboard-element");
    expect(board.id).not.toBe(editor.id);
    expect(board.id).toBe(createHash("sha256").update(canonical(board.contract)).digest("hex"));
    await expect(
      validateContentContracts({ [board.id]: board.contract, [editor.id]: editor.contract })
    ).resolves.toEqual({ [board.id]: board.contract, [editor.id]: editor.contract });
    const changed = await prepareWhiteboardContract("example", {
      ...definition,
      structure: { text: "richtext" },
    });
    await expect(
      validateContentContracts({ [board.id]: board.contract, [changed.id]: changed.contract })
    ).rejects.toThrow("同一节点");
  });

  it("默认值与显式同义声明摘要一致，数组为集合时排序，资源顺序保留", async () => {
    const first = await prepareWhiteboardContract("example", {
      ...definition,
      collaboration: { textFields: ["caption", "source"] },
    });
    const second = await prepareWhiteboardContract("example", {
      ...definition,
      collaboration: { textFields: ["source", "caption"] },
      structure: {
        geometry: "rect",
        container: "none",
        canBeContained: true,
        joins: [],
        text: "none",
        reference: "none",
      },
    });
    expect(first.id).toBe(second.id);
    expect(Object.isFrozen(first.contract.structure.joins)).toBe(true);
    const resources = [
      { path: "one", kind: "image" as const },
      { path: "two", kind: "image" as const },
    ];
    expect((await prepareWhiteboardContract("example", { ...definition, resources })).id).not.toBe(
      (
        await prepareWhiteboardContract("example", {
          ...definition,
          resources: [...resources].reverse(),
        })
      ).id
    );
  });

  it("拒绝旧格式、补领域重算前的旧摘要、未知模式及插件自行传 domain", async () => {
    const board = await prepareWhiteboardContract("example", definition);
    const { domain: _domain, ...withoutDomain } = board.contract;
    await expect(
      validateContentContracts({ [board.id]: { ...withoutDomain, format: 1 } })
    ).rejects.toThrow("版本");
    await expect(validateContentContracts({ [board.id]: withoutDomain })).rejects.toThrow("领域");
    await expect(
      validateContentContracts({ [board.id]: { ...board.contract, domain: "editor-node" } })
    ).rejects.toThrow();
    expect(() =>
      normalizeWhiteboardContract("example", { ...definition, domain: "editor-node" } as never)
    ).toThrow();
    for (const collaboration of [
      { mapFields: ["votes"] },
      { richTextFields: ["body"] },
      { structuredFields: ["value"] },
    ])
      expect(() =>
        normalizeWhiteboardContract("example", { ...definition, collaboration } as never)
      ).toThrow();
    expect(() =>
      normalizeWhiteboardContract("example", {
        ...definition,
        structure: { text: "script" },
      } as never)
    ).toThrow("结构");
  });

  it("字典可同时携带白板和正文契约，但富文本根不能误用白板契约", async () => {
    const board = await prepareWhiteboardContract("example", definition);
    const tree = new NodeTree(new Y.Doc());
    try {
      await tree.installContracts({ [board.id]: board.contract }, "initial");
      const before = Y.encodeStateAsUpdate(tree.doc);
      expect(() =>
        tree.insertNode(
          { type: definition.type, tauContract: board.id, source: "", children: [] },
          null,
          0,
          null
        )
      ).toThrow("契约");
      expect(Y.encodeStateAsUpdate(tree.doc)).toEqual(before);
    } finally {
      tree.doc.destroy();
    }
  });

  it("字段/资源数量、名称长度均有边界，正文源码字段数量受限", async () => {
    const fields = Array.from({ length: CONTENT_CONTRACT_LIMITS.fields }, (_, i) => `f${i}`);
    expect(
      normalizeWhiteboardContract("example", {
        ...definition,
        collaboration: { textFields: fields },
      }).textFields
    ).toHaveLength(fields.length);
    expect(() =>
      normalizeWhiteboardContract("example", {
        ...definition,
        collaboration: { textFields: [...fields, "overflow"] },
      })
    ).toThrow();
    await expect(
      prepareContentContract("example", {
        type: "example.source",
        dataVersion: 1,
        kind: "block",
        collaboration: { textFields: [...fields, "extra"] },
      })
    ).rejects.toThrow("协作字段");
    const resources = Array.from({ length: CONTENT_RESOURCE_LIMITS.specs }, (_, i) => ({
      path: `r${i}`,
      kind: "image" as const,
    }));
    expect(
      normalizeWhiteboardContract("example", { ...definition, resources }).resources
    ).toHaveLength(resources.length);
    expect(() =>
      normalizeWhiteboardContract("example", {
        ...definition,
        resources: [...resources, { path: "extra", kind: "image" }],
      })
    ).toThrow();
    expect(() =>
      normalizeWhiteboardContract("x".repeat(CONTENT_CONTRACT_LIMITS.nameLength + 1), definition)
    ).toThrow();
    expect(() =>
      normalizeWhiteboardContract("example", {
        ...definition,
        resources: [{ path: "x".repeat(CONTENT_RESOURCE_LIMITS.pathLength + 1), kind: "image" }],
      })
    ).toThrow();
  });

  it("字典条数和 UTF-8 总预算在摘要校验前拒绝超限数据", async () => {
    const prepared = await Promise.all(
      Array.from({ length: CONTENT_CONTRACT_LIMITS.contracts }, (_, i) =>
        prepareWhiteboardContract("example", { type: `example.s${i}`, dataVersion: 1 })
      )
    );
    const dictionary = Object.fromEntries(prepared.map(entry => [entry.id, entry.contract]));
    expect(Object.keys(await validateContentContracts(dictionary))).toHaveLength(
      CONTENT_CONTRACT_LIMITS.contracts
    );
    const extra = await prepareWhiteboardContract("example", {
      type: "example.extra",
      dataVersion: 1,
    });
    await expect(
      validateContentContracts({ ...dictionary, [extra.id]: extra.contract })
    ).rejects.toThrow("预算");
    await expect(
      validateContentContracts({
        ["a".repeat(64)]: "字".repeat(CONTENT_CONTRACT_LIMITS.totalBytes),
      })
    ).rejects.toThrow("预算");
  });

  it("所有白板用量在上限合法，上限加一、负数、非整数及未知项拒绝", () => {
    for (const [key, limit] of Object.entries(WHITEBOARD_LIMITS)) {
      expect(() => assertWhiteboardBudget({ [key]: limit })).not.toThrow();
      for (const value of [limit + 1, -1, 0.5, NaN, Infinity])
        expect(() => assertWhiteboardBudget({ [key]: value })).toThrow();
    }
    expect(() => assertWhiteboardBudget({ unlimited: 1 } as never)).toThrow();
  });

  it("普通属性补丁不修改输入，文本/冲突字段与非 JSON 数据拒绝", () => {
    const contract = normalizeWhiteboardContract("example", definition);
    const patch = { title: "标题", options: { count: 3 } };
    const before = JSON.stringify(patch);
    expect(() => assertWhiteboardDataPatch(contract, patch, ["oldTitle"])).not.toThrow();
    expect(JSON.stringify(patch)).toBe(before);
    for (const invalid of [
      { source: "整段覆盖" },
      { x: NaN },
      { x: undefined },
      { x: new Date() },
      JSON.parse('{"x":{"__proto__":{}}}'),
    ])
      expect(() => assertWhiteboardDataPatch(contract, invalid)).toThrow();
    expect(() => assertWhiteboardDataPatch(contract, patch, ["title"])).toThrow("冲突");
    expect(() => assertWhiteboardDataPatch(contract, patch, ["source"])).toThrow("受保护");
    const size = new TextEncoder().encode(
      JSON.stringify({ patch: { title: "" }, unset: [] })
    ).length;
    expect(() =>
      assertWhiteboardDataPatch(contract, {
        title: "x".repeat(WHITEBOARD_LIMITS.patchBytes - size),
      })
    ).not.toThrow();
    expect(() =>
      assertWhiteboardDataPatch(contract, {
        title: "x".repeat(WHITEBOARD_LIMITS.patchBytes - size + 1),
      })
    ).toThrow("预算");
  });
});
