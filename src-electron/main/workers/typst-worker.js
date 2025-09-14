// @eslint-disable
const { createRequire } = require("module");
const nodeRequire = createRequire(__filename);
const { NodeCompiler } = nodeRequire("@myriaddreamin/typst-ts-node-compiler");

/**
 * @typedef {{ code: string, inputs: Record<string,string>, prelude: string }} Payload
 */

process.on(
  "message",
  /** @param {Payload} msg */ (msg) => {
    try {
      const compiler = NodeCompiler.create();
      const result = compiler.tryHtml({
        mainFileContent: `${msg.prelude}\n${msg.code}`,
        inputs: msg.inputs || {},
      });
      if (!result.result) {
        result.printDiagnostics();
        if (process.send) process.send({ ok: false });
        process.exitCode = 1;
        return;
      }
      const html = result.result.body();
      if (process.send) process.send({ ok: true, html });
    } catch (e) {
      console.error(e && e.stack ? e.stack : String(e));
      if (process.send) process.send({ ok: false });
      process.exitCode = 1;
    }
  },
);
