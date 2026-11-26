import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { codeBlockCodec } from "@tau/editor/extensions/code-block/markdown";
import { queryDatabaseCodec } from "./markdown";
import { initialQueryPresentation } from "@/features/shared/query-database/presentation";

const processor = createMarkdownProcessor({ codecs: [queryDatabaseCodec, codeBlockCodec] });
it("查询源码、参数与视图配置经过 Markdown 往返保持一致", () => {
  const element = {
    type: "query-database" as const,
    id: "original",
    language: "javascript" as const,
    code: 'const text = "```嵌套围栏```";\nreturn {columns:[],rows:[]};',
    paramsJson: JSON.stringify({ tag: "读书 / 旅行", tableId: 4 }),
    presentationJson: JSON.stringify(initialQueryPresentation()),
    children: [{ type: "formatted" as const, text: "" }],
  };
  const imported = processor.importFromMarkdown(processor.getMarkdown([element]))[0];
  expect(imported).toMatchObject({
    type: element.type,
    code: element.code,
    language: element.language,
    paramsJson: element.paramsJson,
    presentationJson: element.presentationJson,
  });
});
it("专用围栏被识别为查询块，普通 JavaScript 仍保持代码", () => {
  const query = processor.importFromMarkdown("```tau-query\nTABLE title FROM cards\n```")[0];
  const code = processor.importFromMarkdown("```javascript\nreturn 1;\n```")[0];
  expect(query).toMatchObject({
    type: "query-database",
    language: "dsl",
    code: "TABLE title FROM cards",
  });
  expect(code).toMatchObject({ type: "code-block", code: "return 1;" });
});
