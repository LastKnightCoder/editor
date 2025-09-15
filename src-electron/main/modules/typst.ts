import { ipcMain } from "electron";
import { Module } from "../types/module";
import { fork } from "child_process";
import path from "path";

const DEFAULT_PRELUDE = `
#show math.equation: it => context {
  // only wrap in frame on html export
  if target() == "html" {
    // wrap frames of inline equations in a box
    // so they don't interrupt the paragraph
    show: if it.block { it => it } else { box }
    html.frame(it)
  } else {
    it
  }
}`;

async function compileTypstInChild(
  code: string,
  inputs: Record<string, string>,
): Promise<string> {
  const workerPath = path.join(__dirname, "workers", "typst-worker.js");

  return new Promise((resolve, reject) => {
    const child = fork(workerPath, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });

    let stderr = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });

    type Msg = { ok: true; html: string } | { ok: false };
    let settled = false;
    child.on("message", (m: Msg) => {
      if (settled) return;
      if (m && m.ok === true) {
        settled = true;
        resolve(m.html);
      } else if (m && m.ok === false) {
        reject(stderr);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        reject("No output from typst worker");
      } else {
        settled = true;
        reject(stderr || `Typst worker exited with code ${code}`);
      }
    });

    const payload = { code, inputs, prelude: DEFAULT_PRELUDE };
    child.send(payload);
  });
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
      },
    );
  }
}

export default new TypstModule();
