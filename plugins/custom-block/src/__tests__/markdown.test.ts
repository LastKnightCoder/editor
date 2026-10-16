// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { customBlockCodec } from "../markdown";

const md = createMarkdownProcessor({ codecs: [customBlockCodec] });

describe("custom-block 拆包 codec", () => {
  it("源码围栏普通与带位置往返保持一致", () => {
    const source = "```custom-block\nconst Component = () => <div>内容</div>;\n```";
    const imported = md.importFromMarkdownWithPositions(source);
    expect(imported.content[0]).toMatchObject({
      type: "custom-block",
      content: "const Component = () => <div>内容</div>;",
    });
    expect(md.getMarkdown(imported.content).trim()).toBe(source);
    expect(md.getMarkdownWithPositions(imported.content).markdown.trim()).toBe(source);
  });

  it("纯 codec 可独立测试，拒绝连带 UI 或编译器", () => {
    const script = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (/^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|@babel\\/|@tau\\/(?:editor$|editor\\/api|ui))/.test(specifier))
          throw new Error('禁止 headless 加载 ' + specifier);
        return next(specifier, context);
      }});
      const { customBlockCodec } = await import('../markdown.ts');
      const { createMarkdownProcessor } = await import('@tau/markdown');
      const md = createMarkdownProcessor({ codecs: [customBlockCodec] });
      const source = '\x60\x60\x60custom-block\\nreturn 1\\n\x60\x60\x60';
      console.log(JSON.stringify([typeof document, typeof React, md.getMarkdown(md.importFromMarkdown(source)).trim()]));
    `;
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      {
        cwd: import.meta.dirname,
        encoding: "utf8",
      }
    );
    expect(JSON.parse(output)).toEqual([
      "undefined",
      "undefined",
      "```custom-block\nreturn 1\n```",
    ]);
  });
});
