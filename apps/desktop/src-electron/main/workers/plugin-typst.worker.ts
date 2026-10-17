import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";

const DEFAULT_PRELUDE = `
#show math.equation: it => context {
  // HTML 导出时将公式转为布局片段。
  if target() == "html" {
    // 行内公式保持在段落中。
    show: if it.block { it => it } else { box }
    html.frame(it)
  } else {
    it
  }
}`;

process.once(
  "message",
  (input: { source: string; inputs: Record<string, string>; workspace: string }) => {
    try {
      const compiler = NodeCompiler.create({ workspace: input.workspace });
      const output = compiler.tryHtml({
        mainFileContent: `${DEFAULT_PRELUDE}\n${input.source}`,
        inputs: input.inputs,
      });
      if (!output.result) {
        output.printDiagnostics();
        process.send?.({ ok: false, error: "Typst 编译失败，请检查源码、附件与输入变量" });
      } else process.send?.({ ok: true, value: { html: output.result.body() } });
    } catch (error) {
      process.send?.({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
);
