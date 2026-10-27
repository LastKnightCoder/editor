import { expect, it } from "vitest";
import type { Descendant } from "slate";
import { desktopContentPlugins } from "../../../../shared/content-plugins";
import { getContentConversionKit } from "@/services/editorKit";

const execute = async (request: unknown) => {
  await import("../content-runtime");
  return (
    globalThis as unknown as {
      tauContentExecute(input: unknown): Promise<unknown>;
    }
  ).tauContentExecute({ hash: "unit-fixtures", artifacts: [], request });
};

it("按契约建索引时内容链接导出为 Markdown 语法，不退化为无损载荷", async () => {
  const catalog = await desktopContentPlugins.prepareEditorContracts(
    getContentConversionKit().extensions
  );
  const document = await catalog.createDocument([
    {
      type: "paragraph",
      children: [
        { type: "formatted", text: "整理为" },
        {
          type: "content-link",
          refId: 534,
          contentId: 1320,
          contentType: "card",
          contentTitle: "",
          children: [{ type: "formatted", text: "卡片" }],
        },
        { type: "formatted", text: "。" },
      ],
    },
  ] as unknown as Descendant[]);
  const result = (await execute({
    operation: "index",
    input: {
      raw: JSON.stringify(document.content),
      title: "日记",
      whole: false,
      sections: true,
    },
    contracts: document.contracts,
  })) as { content: string; sections: { text: string }[] };
  expect(result.content).toContain(
    ":content-link[卡片]{refId=534 contentId=1320 contentType=card}"
  );
  expect(result.content).not.toContain("tau-node");
  expect(result.sections[0].text).not.toContain("tau-node");
});
