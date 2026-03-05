import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(currentDir, relativePath), "utf-8");

describe("shared chat entry regression", () => {
  it("ChatTab 仅使用 SharedChatTab", () => {
    const content = readSource("../tabs/ChatTab.tsx");
    expect(content).toContain("SharedChatTab");
    expect(content).not.toContain("LegacyChatTab");
  });

  it("SettingsPage 已移除统一聊天灰度开关", () => {
    const content = readSource("../SettingsPage.tsx");
    expect(content).not.toContain("统一聊天核心（灰度）");
    expect(content).not.toContain("useFeatureFlagStore");
  });
});
