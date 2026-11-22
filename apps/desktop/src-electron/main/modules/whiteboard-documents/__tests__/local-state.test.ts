// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openWhiteboardState } from "../local-state";

const noNetwork = async () => {
  throw new Error("本机白板无需连接协作服务");
};

it("旧协作库不可读时保留文件，独立状态仍支持本机资源保存和重开", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-whiteboard-corrupt-store-"));
  mkdirSync(join(directory, "collaboration"));
  const old = join(directory, "collaboration", "collaboration.db");
  writeFileSync(old, "损坏协作库夹具");
  const first = openWhiteboardState(directory, noNetwork);
  let reference: string;
  try {
    reference = await first.assets.keepLocalFile("board", {
      name: "media.txt",
      mime: "text/plain",
      bytes: Buffer.from("本机资源"),
    });
  } finally {
    first.store.db.close();
  }
  const reopened = openWhiteboardState(directory, noNetwork);
  try {
    const path = await reopened.assets.resolveReference("", "board", reference);
    expect(readFileSync(path, "utf8")).toBe("本机资源");
    expect(readFileSync(old, "utf8")).toBe("损坏协作库夹具");
  } finally {
    reopened.store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
