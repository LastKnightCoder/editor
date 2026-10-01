import { describe, expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { diagramExtensions, createPlantUMLExtension } from "../index";

describe("图表预览块拖拽装配", () => {
  it.each(["mermaid", "plantuml", "tikz", "typst", "abc"])("%s 保留拖拽源与放置目标", type => {
    const kit = createEditorKit({ extensions: diagramExtensions });
    expect(kit.assembly.dragSpecs.get(type)).toEqual({ self: true, children: true });
  });

  it("自定义配置的 PlantUML 同样可拖拽", () => {
    const kit = createEditorKit({
      extensions: [createPlantUMLExtension({ server: "https://uml.example.com" })],
    });
    expect(kit.assembly.dragSpecs.get("plantuml")?.self).toBe(true);
  });
});
