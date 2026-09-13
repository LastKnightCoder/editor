import { describe, expect, it } from "vitest";

import { toUnpackedAsarPath } from "../asarPath";

describe("toUnpackedAsarPath", () => {
  it("把 Windows 风格 asar 路径改写到 unpacked", () => {
    expect(
      toUnpackedAsarPath(
        "C:\\Program Files\\Tau\\resources\\app.asar\\node_modules\\7zip-bin\\win\\x64\\7za.exe"
      )
    ).toBe(
      "C:\\Program Files\\Tau\\resources\\app.asar.unpacked\\node_modules\\7zip-bin\\win\\x64\\7za.exe"
    );
  });

  it("把 POSIX 风格 asar 路径改写到 unpacked", () => {
    expect(
      toUnpackedAsarPath(
        "/Applications/Tau.app/Contents/Resources/app.asar/node_modules/@vscode/ripgrep/bin/rg"
      )
    ).toBe(
      "/Applications/Tau.app/Contents/Resources/app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg"
    );
  });

  it("路径不含 asar 时原样返回（dev 环境）", () => {
    const devPath = "/repo/node_modules/.pnpm/7zip-bin@5.1.1/node_modules/7zip-bin/win/x64/7za.exe";

    expect(toUnpackedAsarPath(devPath)).toBe(devPath);
  });

  it("已是 unpacked 的路径保持不变（幂等）", () => {
    const unpackedPath =
      "C:\\Program Files\\Tau\\resources\\app.asar.unpacked\\node_modules\\7zip-bin\\win\\x64\\7za.exe";

    expect(toUnpackedAsarPath(unpackedPath)).toBe(unpackedPath);
  });
});
