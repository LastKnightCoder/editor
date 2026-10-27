import { describe, expect, it } from "vitest";
import { canvasFields, prepareBuiltinWhiteboardTypes } from "../collaboration/builtins";
import { resolveTextStyle } from "../constants/text-style";

describe("旧白板外观只读兼容", () => {
  it("升级时原样保存在 data 里的旧色值投影到画布元素并换算成语义样式", async () => {
    const { types } = await prepareBuiltinWhiteboardTypes();
    const codec = types.richtext;
    const fields = canvasFields(
      {
        contractId: codec.contractId,
        data: { background: "#fff", topColor: "#F24A6E", maxWidth: 200 },
        body: [],
      },
      codec
    );
    expect(fields).toMatchObject({ background: "#fff", topColor: "#F24A6E" });
    expect(resolveTextStyle({ type: "richtext", ...fields })).toEqual({
      variant: "band",
      tone: "red",
    });
  });
});
