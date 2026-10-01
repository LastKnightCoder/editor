import { describe, expect, it } from "vitest";

import { applyDarkTheme } from "../renderers/plantuml-source";

describe("PlantUML applyDarkTheme（slidev 方案：暗色注入 !theme）", () => {
  it("应在 @startuml 之后注入主题指令", () => {
    const content = "@startuml\nAlice -> Bob: hi\n@enduml";
    expect(applyDarkTheme(content, "cyborg-outline")).toBe(
      "@startuml\n!theme cyborg-outline\nAlice -> Bob: hi\n@enduml"
    );
  });

  it("其他 @startXXX 图类型同样支持", () => {
    const content = "@startmindmap\n* root\n@endmindmap";
    expect(applyDarkTheme(content, "hacker")).toContain("!theme hacker\n");
  });

  it("图源已声明 !theme 时不重复注入", () => {
    const content = "@startuml\n!theme spacelab\nAlice -> Bob: hi\n@enduml";
    expect(applyDarkTheme(content, "cyborg-outline")).toBe(content);
  });

  it("主题名为空时不注入", () => {
    const content = "@startuml\nAlice -> Bob: hi\n@enduml";
    expect(applyDarkTheme(content, "")).toBe(content);
  });

  it("缺少 @startXXX 时注入在最前", () => {
    const content = "Alice -> Bob: hi";
    expect(applyDarkTheme(content, "cyborg-outline")).toBe(
      "!theme cyborg-outline\nAlice -> Bob: hi"
    );
  });
});
