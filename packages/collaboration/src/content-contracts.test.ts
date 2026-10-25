import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  normalizeContentContract,
  prepareContentContract,
  validateContentContracts,
  type ContentContractDefinition,
} from "@tau/db-schema/content-contracts";

const definition: ContentContractDefinition = {
  type: "example.diagram",
  dataVersion: 1,
  kind: "block",
  isVoid: true,
  collaboration: { textFields: ["source"] },
  resources: [{ path: "cover", kind: "image" }],
};

describe("节点数据契约", () => {
  it("默认值与声明顺序不改变身份，摘要与标准 SHA-256 一致", async () => {
    const first = await prepareContentContract("example", {
      ...definition,
      isVoid: false,
      collaboration: { textFields: ["source", "caption"] },
    });
    const second = await prepareContentContract("example", {
      resources: definition.resources,
      kind: "block",
      dataVersion: 1,
      type: "example.diagram",
      collaboration: { textFields: ["caption", "source"] },
    });
    expect(first.id).toBe(second.id);
    const sorted = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(sorted)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map(key => [key, sorted((value as Record<string, unknown>)[key])])
            )
          : value;
    expect(first.id).toBe(
      createHash("sha256")
        .update(JSON.stringify(sorted(first.contract)))
        .digest("hex")
    );
    expect(Object.isFrozen(first.contract.textFields)).toBe(true);
  });

  it("字段合并方式、资源次序、归属或数据版本变化产生新契约", async () => {
    const initial = await prepareContentContract("example", definition);
    for (const changed of [
      { ...definition, dataVersion: 2 },
      { ...definition, collaboration: { textFields: ["code"] } },
      { ...definition, resources: [{ path: "image", kind: "image" as const }] },
    ])
      expect((await prepareContentContract("example", changed)).id).not.toBe(initial.id);
    expect((await prepareContentContract("another", definition)).id).not.toBe(initial.id);
  });

  it("校验传入字典，不接受篡改、同版本分歧或未知协议", async () => {
    const first = await prepareContentContract("example", definition);
    const second = await prepareContentContract("example", {
      ...definition,
      collaboration: { textFields: ["code"] },
    });
    await expect(validateContentContracts({ [first.id]: first.contract })).resolves.toEqual({
      [first.id]: first.contract,
    });
    await expect(validateContentContracts({ [first.id]: second.contract })).rejects.toThrow("摘要");
    await expect(
      validateContentContracts({ [first.id]: first.contract, [second.id]: second.contract })
    ).rejects.toThrow("同一节点");
    await expect(
      validateContentContracts({ [first.id]: { ...first.contract, format: 99 } })
    ).rejects.toThrow("协议");
  });

  it("拒绝保留属性、重复字段、资源重叠与不合法数据版本", () => {
    for (const textFields of [
      ["children"],
      ["collabId"],
      ["tauContract"],
      ["source", "source"],
      ["cover"],
      ["nested.source"],
    ])
      expect(() =>
        normalizeContentContract("example", { ...definition, collaboration: { textFields } })
      ).toThrow();
    expect(() => normalizeContentContract("example", { ...definition, dataVersion: 0 })).toThrow();
    expect(() =>
      normalizeContentContract("example", {
        ...definition,
        collaboration: { textFields: ["source"], structuredFields: ["source"] } as never,
      })
    ).toThrow();
  });
});
