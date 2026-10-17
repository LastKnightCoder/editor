import { ipcMain } from "electron";
import { Module } from "../types/module";
import { executePluginCompiler } from "../services/plugin-compilers";

async function compileTypstInChild(code: string, inputs: Record<string, string>): Promise<string> {
  const result = (await executePluginCompiler(
    { kind: "typst", source: code, inputs, files: [] },
    new AbortController().signal,
    () => undefined
  )) as { html: string };
  return result.html;
}

class TypstModule implements Module {
  name: string;

  constructor() {
    this.name = "typst";
  }

  async init() {
    ipcMain.handle(
      "compile-typst",
      async (_event, code: string, inputs: Record<string, string>) => {
        try {
          const html = await compileTypstInChild(code, inputs);
          return html;
        } catch (e) {
          throw typeof e === "string"
            ? new Error(e)
            : e instanceof Error
              ? e
              : new Error(JSON.stringify(e));
        }
      }
    );
  }
}

export default new TypstModule();
