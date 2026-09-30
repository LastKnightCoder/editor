// @vitest-environment node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(?:tsx?|css|less)$/.test(file) && !/\.(?:test|spec)\./.test(file) ? [file] : [];
  });
}

describe("旧桌面主题退役", () => {
  it("桌面与共享 UI 不再消费旧变量和旧作用域", () => {
    const violations = ["apps/desktop/src", "packages/shared/src"].flatMap(directory =>
      sources(join(root, directory))
        .filter(file => /--th-|th-scope-(?:light|dark)/.test(readFileSync(file, "utf8")))
        .map(file => relative(root, file))
    );
    expect(violations).toEqual([]);
  });

  it("旧主题实现不能恢复", () => {
    const retired = [
      "styles/theme-colors.css",
      "hooks/useThemeColors.ts",
      "hooks/useBackgroundMode.ts",
      "hooks/useSyncTheme.ts",
      "constants/accent.ts",
    ];
    expect(retired.filter(file => existsSync(join(root, "apps/desktop/src", file)))).toEqual([]);
  });
});
