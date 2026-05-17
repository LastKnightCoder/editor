import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useEffect } from "react";
import { createEditor, Descendant, Editor as SlateEditor } from "slate";
import { Slate, useSlateStatic, withReact } from "slate-react";

import useIsLastElement from "../useIsLastElement";

const createParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

function Probe({
  element,
  onValue,
}: {
  element: Descendant;
  onValue: (value: boolean, editor: SlateEditor) => void;
}) {
  const editor = useSlateStatic();
  const isLast = useIsLastElement(element as any);

  useEffect(() => {
    onValue(isLast, editor);
  }, [editor, isLast, onValue]);

  return null;
}

describe("useIsLastElement", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  it("节点引用失效时返回 false，不抛异常", async () => {
    const staleElement = createParagraph("旧节点");
    const observed: boolean[] = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <Slate
          editor={withReact(createEditor())}
          initialValue={[createParagraph("当前内容")]}
        >
          <Probe
            element={staleElement}
            onValue={(value) => {
              observed.push(value);
            }}
          />
        </Slate>,
      );
    });

    expect(observed.at(-1)).toBe(false);
  });
});
