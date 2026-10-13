import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "tau-plugin-demo-"));
try {
  for (const mode of ["write", "read"]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("dist/main.js", import.meta.url)), mode, directory],
      {
        stdio: "inherit",
        timeout: 10_000,
      }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`插件示例 ${mode} 失败：${result.status}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
