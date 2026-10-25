import { Activity, act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { createEditor, type Descendant, type Element } from "slate";
import { Slate, withReact, useSlateStatic } from "slate-react";
import { IEditorTextFields } from "../../../source-contracts";
import { createLocalTextFields } from "../kit/localTextFields";
import { useTextFieldBinding } from "../api/useTextFieldBinding";

it("Activity 隐藏释放字段，恢复重新订阅并可连续编辑", async () => {
  const editor = withReact(createEditor());
  const element = {
    type: "paragraph",
    source: "初稿",
    children: [{ type: "formatted", text: "" }],
  } as Element;
  const fields = createLocalTextFields(editor, [
    {
      type: "paragraph",
      kind: "block",
      collaboration: { textFields: ["source"] },
      render: () => null,
    },
  ]);
  editor.tryGetService = (id =>
    id === IEditorTextFields ? fields : undefined) as typeof editor.tryGetService;
  let binding: ReturnType<typeof useTextFieldBinding>;
  let setHidden!: (hidden: boolean) => void;
  function Probe() {
    const current = useSlateStatic();
    binding = useTextFieldBinding(current.children[0] as Element, "source");
    return <output>{binding.value}</output>;
  }
  function Host() {
    const [hidden, set] = useState(false);
    setHidden = set;
    return (
      <Slate editor={editor} initialValue={[element] as Descendant[]}>
        <Activity mode={hidden ? "hidden" : "visible"}>
          <Probe />
        </Activity>
      </Slate>
    );
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Host />));
    expect(binding!.binding).toBeTruthy();
    for (const next of ["第二稿", "第三稿"]) {
      const previous = binding!.binding!;
      await act(async () => setHidden(true));
      expect(() => previous.edit({ offset: 0, remove: 0, text: "过期" })).toThrow();
      await act(async () => setHidden(false));
      expect(binding!.binding).not.toBe(previous);
      await act(async () => binding!.binding!.replace(next, binding!.revision));
      expect(host.querySelector("output")?.textContent).toBe(next);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
