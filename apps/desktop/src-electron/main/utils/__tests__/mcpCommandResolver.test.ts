import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildMcpSpawnEnv,
  findExecutableInPath,
  resolveMcpCommand,
} from "../mcpCommandResolver";

describe("mcpCommandResolver", () => {
  const originalPath = process.env.PATH;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-cmd-test-"));
    process.env.PATH = [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/Users/test/.nvm/versions/node/v24.1.0/bin",
    ].join(path.delimiter);
  });

  afterEach(async () => {
    process.env.PATH = originalPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("未显式传入 env 时应继承当前 PATH", () => {
    const env = buildMcpSpawnEnv();

    expect(env.PATH).toBe(process.env.PATH);
  });

  it("传入自定义 env 但未包含 PATH 时应保留当前 PATH", () => {
    const env = buildMcpSpawnEnv({
      FOO: "bar",
    });

    expect(env.FOO).toBe("bar");
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("传入自定义 PATH 时应优先使用用户值", () => {
    const env = buildMcpSpawnEnv({
      PATH: "/custom/bin",
      FOO: "bar",
    });

    expect(env.PATH).toBe("/custom/bin");
    expect(env.FOO).toBe("bar");
  });

  it("应能从 PATH 中解析裸命令为绝对路径", async () => {
    const commandPath = path.join(tempDir, "npx");
    await fs.writeFile(commandPath, "#!/bin/sh\nexit 0\n", "utf8");
    await fs.chmod(commandPath, 0o755);

    const resolved = findExecutableInPath("npx", tempDir);

    expect(resolved).toBe(commandPath);
  });

  it("PATH 未命中时应回退到登录 shell 解析命令", () => {
    const env = buildMcpSpawnEnv({
      PATH: "/usr/bin:/bin",
    });

    const resolved = resolveMcpCommand("npx", env);

    expect(path.basename(resolved)).toBe("npx");
  });

  it("绝对路径命令应直接返回", () => {
    const resolved = resolveMcpCommand(
      "/Users/test/.nvm/versions/node/v24.1.0/bin/npx",
      buildMcpSpawnEnv(),
    );

    expect(resolved).toBe("/Users/test/.nvm/versions/node/v24.1.0/bin/npx");
  });

  it("找不到命令时应抛出带命令名的可读错误", () => {
    expect(() =>
      resolveMcpCommand(
        "__mcp_command_that_should_not_exist__",
        buildMcpSpawnEnv({
          PATH: "/usr/bin:/bin",
        }),
      ),
    ).toThrow(/未找到可执行命令 "__mcp_command_that_should_not_exist__"/);
  });
});
