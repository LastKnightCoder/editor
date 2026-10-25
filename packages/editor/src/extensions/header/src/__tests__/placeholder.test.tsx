// 空标题是唯一块时，编辑器占位文字定位在标题元素里（w-fit，宽度随内容为 0）；不禁止折行就会逐字竖排
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { Descendant } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import headerExtension from "..";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("空标题里的占位文字不折行", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <Editor
        kit={createEditorKit({ extensions: [headerExtension] })}
        initValue={
          [
            { type: "header", level: 2, children: [{ type: "formatted", text: "" }] },
          ] as unknown as Descendant[]
        }
        readonly={false}
        placeHolder="写点什么"
      />
    )
  );
  // jsdom 不渲染 Slate 占位文字（依赖布局测量），这里守住标题元素上的规则
  expect(container.querySelector("h2")?.className).toContain(
    "[&_[data-slate-placeholder]]:whitespace-nowrap"
  );
  await act(async () => root.unmount());
  container.remove();
});
