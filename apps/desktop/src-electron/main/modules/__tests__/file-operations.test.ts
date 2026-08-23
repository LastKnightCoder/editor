import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
}));

import FileModule from "../file";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "tau-file-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("文件操作", () => {
  it("独占创建不会覆盖并发创建的文件", async () => {
    const directory = await createTemporaryDirectory();
    const filePath = join(directory, "note.md");

    await FileModule.createTextFileExclusive(filePath, "first");
    await expect(
      FileModule.createTextFileExclusive(filePath, "second"),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(filePath, "utf8")).resolves.toBe("first");
  });

  it("重命名不会覆盖已存在的目标文件", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "source.md");
    const targetPath = join(directory, "target.md");
    await writeFile(sourcePath, "source");
    await writeFile(targetPath, "target");

    await expect(
      FileModule.renameFileOrDirectory(sourcePath, targetPath),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("source");
    await expect(readFile(targetPath, "utf8")).resolves.toBe("target");
  });

  it("保留目录重命名能力且拒绝覆盖目标目录", async () => {
    const directory = await createTemporaryDirectory();
    const sourcePath = join(directory, "folder");
    const targetPath = join(directory, "renamed-folder");
    await mkdir(sourcePath);

    await FileModule.renameFileOrDirectory(sourcePath, targetPath);
    await expect(readFile(join(targetPath, "missing"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await mkdir(sourcePath);
    await expect(
      FileModule.renameFileOrDirectory(sourcePath, targetPath),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });
});
