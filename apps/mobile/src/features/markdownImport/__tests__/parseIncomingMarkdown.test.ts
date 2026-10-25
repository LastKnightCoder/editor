import { describe, expect, it } from "vitest";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { mobileContentPlugins } from "../../../app/plugins/content";
import { getMobileContentKit } from "../../../services/editorKit";
import { parseIncomingMarkdown } from "../parseIncomingMarkdown";

describe("parseIncomingMarkdown", () => {
  it("解析正文并忽略 YAML 头", async () => {
    const { content, contracts } = await parseIncomingMarkdown(
      "---\ntitle: 头信息\n---\n\n# 标题\n\n正文段落"
    );
    const types = content.map(node => (node as { type?: string }).type);
    expect(types).not.toContain("yaml");
    expect(types).not.toContain("front-matter");
    expect(JSON.stringify(content)).toContain("正文段落");
    expect(JSON.stringify(content)).not.toContain("头信息");
    expect(Object.keys(contracts).length).toBeGreaterThan(0);
  });

  it("空文件得到带契约的空段落", async () => {
    const { content, contracts } = await parseIncomingMarkdown("");
    expect(content).toMatchObject([{ type: "paragraph", children: [{ text: "" }] }]);
    expect(Object.values(contracts).some(contract => contract.type === "paragraph")).toBe(true);
  });

  it("未安装插件时，文件中的旧版本节点及契约仍完整保留", async () => {
    const old = await prepareContentContract("missing.plugin", {
      type: "missing.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
    });
    const contracts = { [old.id]: old.contract };
    const processor = await mobileContentPlugins.prepareMarkdown(getMobileContentKit().extensions, {
      contracts,
      codecs: [],
    });
    const markdown = processor.getMarkdown([
      {
        type: "missing.source",
        tauContract: old.id,
        source: "旧源码",
        custom: { keep: true },
        children: [{ text: "" }],
      },
    ] as never);
    const restored = await parseIncomingMarkdown(markdown);
    expect(restored.contracts[old.id]).toEqual(old.contract);
    expect(restored.content[0]).toMatchObject({
      tauContract: old.id,
      source: "旧源码",
      custom: { keep: true },
    });
  });
});
