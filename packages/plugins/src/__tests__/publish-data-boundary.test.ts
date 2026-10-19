import { expect, it } from "vitest";
import ts from "typescript";
import { fileURLToPath } from "node:url";

it("发布数据与客户端的类型闭包不引入编辑器、React 或 UI", () => {
  const program = ts.createProgram(
    ["../publish-data.ts", "../publish-client.ts"].map(file =>
      fileURLToPath(new URL(file, import.meta.url))
    ),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
    }
  );
  const files = program.getSourceFiles().map(file => file.fileName);
  expect(files.some(file => /\/(?:packages\/(?:editor|ui|whiteboard|markdown)|editor-extensions)\//.test(file))).toBe(false);
  expect(files.some(file => /\/(?:react|slate|@types\/react)\//.test(file))).toBe(false);
});
