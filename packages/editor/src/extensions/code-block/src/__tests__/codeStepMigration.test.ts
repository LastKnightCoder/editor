import { describe, expect, it } from "vitest";
import { convertLegacyCodeBlock } from "../codeStepMigration";

const legacy = {
  type: "code-block",
  language: "typescript",
  uuid: "block",
  code: "root",
  children: [{ text: "" }],
};
const ids = () => {
  let index = 0;
  return () => `new-${++index}`;
};

describe("代码步骤基线转换", () => {
  it("普通源码进入独立步骤，视图状态和旧契约不进入新正文", () => {
    const source = {
      ...legacy,
      isFold: true,
      foldHeight: 320,
      highlightLines: "1",
      custom: { value: 2 },
      tauContract: "old",
    };
    const result = convertLegacyCodeBlock(source, ids());
    expect(result.element).toEqual({
      type: "code-block",
      language: "typescript",
      uuid: "block",
      custom: { value: 2 },
      children: [
        {
          type: "code-step",
          code: "root",
          highlightLines: "1",
          collabId: "new-1",
          children: [{ type: "formatted", text: "" }],
        },
      ],
    });
    expect(result.view).toEqual({ activeStepId: "new-1", isFold: true, foldHeight: 320 });
    expect(result.recovery).toEqual([]);
    expect(source.code).toBe("root");
    expect(source.tauContract).toBe("old");
  });

  it("重复旧 ID 分配不同身份，根源码冲突不覆盖任一步", () => {
    const source = {
      ...legacy,
      magicMove: {
        v: 1,
        activeStep: 1,
        steps: [
          { id: "same", code: "first", title: "第一步", custom: 1 },
          { id: "same", code: "second", highlightLines: "2" },
        ],
      },
    };
    const result = convertLegacyCodeBlock(source, ids());
    expect(result.element.children.map(step => step.code)).toEqual(["first", "second"]);
    expect(result.element.children.map(step => step.collabId)).toEqual(["new-1", "new-2"]);
    expect(result.element.children[0]).toMatchObject({ title: "第一步", custom: 1 });
    expect(result.view.activeStepId).toBe("new-2");
    expect(result.recovery).toEqual([
      { reason: "root-source-conflict", code: "root", stepId: "new-2" },
    ]);
    expect(source.magicMove.steps[1].code).toBe("second");
  });

  it("损坏步骤、额外正文和重复新身份阻止安装，不返回删减后的正文", () => {
    expect(() => convertLegacyCodeBlock({ ...legacy, children: [{ text: "正文" }] })).toThrow();
    expect(() =>
      convertLegacyCodeBlock({
        ...legacy,
        magicMove: { v: 1, activeStep: 0, steps: [{ code: 1 }] },
      })
    ).toThrow();
    expect(() =>
      convertLegacyCodeBlock(
        { ...legacy, magicMove: { v: 1, activeStep: 0, steps: [{ code: "a" }, { code: "b" }] } },
        () => "duplicate"
      )
    ).toThrow();
  });
});
