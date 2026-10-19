import { describe, expect, it } from "vitest";
import { createPlantUMLExtension } from "../index";

const renderProps = (extension: ReturnType<typeof createPlantUMLExtension>) => {
  const element = (
    extension.elements![0].render as (props: unknown) => {
      props: { server?: string; darkTheme?: string };
    }
  )({
    attributes: {} as never,
    element: { type: "plantuml", content: "", children: [{ type: "formatted", text: "" }] },
    children: null,
  });
  return element.props;
};

describe("PlantUML 扩展参数", () => {
  it("未传参数时交给渲染器默认值", () => {
    const props = renderProps(createPlantUMLExtension());
    expect(props.server).toBeUndefined();
    expect(props.darkTheme).toBeUndefined();
  });
  it("服务地址和暗色主题传给块组件", () => {
    const props = renderProps(
      createPlantUMLExtension({ server: "https://uml.example.com", darkTheme: "" })
    );
    expect(props.server).toBe("https://uml.example.com");
    expect(props.darkTheme).toBe("");
  });
});
