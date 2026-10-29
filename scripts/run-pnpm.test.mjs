import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withPnpmDirOnPath } from "./run-pnpm.mjs";

function dirWithPnpmCmd(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "pnpm.CMD"), "@echo off\r\n");
  return dir;
}

test(
  "Windows 上把含 pnpm.CMD 的候选目录前置到 PATH 且不重复",
  { skip: process.platform !== "win32" },
  () => {
    const pnpmHome = dirWithPnpmCmd("run-pnpm-home-");
    const npmGlobal = dirWithPnpmCmd("run-pnpm-npm-");
    const plain = mkdtempSync(join(tmpdir(), "run-pnpm-plain-"));
    const original = { PNPM_HOME: process.env.PNPM_HOME, APPDATA: process.env.APPDATA };
    process.env.PNPM_HOME = pnpmHome;
    process.env.APPDATA = join(npmGlobal, "..");
    // APPDATA 指向父目录时 join(APPDATA, "npm") 不含 pnpm.CMD，只有 PNPM_HOME 生效
    try {
      const env = { PATH: [plain].join(";") };
      const updated = withPnpmDirOnPath(env);
      const parts = updated.PATH.split(";");
      assert.equal(parts[0], pnpmHome);
      assert.ok(parts.includes(plain));

      // 已在 PATH 中的目录不重复添加
      const withDup = { PATH: [pnpmHome, plain].join(";") };
      assert.equal(
        withPnpmDirOnPath(withDup)
          .PATH.split(";")
          .filter(part => part.toLowerCase() === pnpmHome.toLowerCase()).length,
        1
      );
    } finally {
      process.env.PNPM_HOME = original.PNPM_HOME;
      process.env.APPDATA = original.APPDATA;
      rmSync(pnpmHome, { recursive: true, force: true });
      rmSync(npmGlobal, { recursive: true, force: true });
      rmSync(plain, { recursive: true, force: true });
    }
  }
);

test("候选目录中没有 pnpm.CMD 时不改动 PATH", { skip: process.platform !== "win32" }, () => {
  const empty = mkdtempSync(join(tmpdir(), "run-pnpm-empty-"));
  const original = { PNPM_HOME: process.env.PNPM_HOME, APPDATA: process.env.APPDATA };
  process.env.PNPM_HOME = empty;
  process.env.APPDATA = empty;
  try {
    const env = { PATH: "C:\\Windows" };
    assert.equal(withPnpmDirOnPath(env), env);
  } finally {
    process.env.PNPM_HOME = original.PNPM_HOME;
    process.env.APPDATA = original.APPDATA;
    rmSync(empty, { recursive: true, force: true });
  }
});
