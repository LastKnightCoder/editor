import { useMemo, type ComponentProps } from "react";
import { UnControlled } from "react-codemirror2";
import type { EditorConfiguration } from "codemirror";
import "./modes";

type Props = Omit<ComponentProps<typeof UnControlled>, "options"> & {
  mode: string;
  readOnly: boolean;
  lineWrapping?: boolean;
};

export default function SourceCodeEditor({
  mode,
  readOnly,
  lineWrapping = false,
  ...props
}: Props) {
  const options = useMemo<EditorConfiguration>(
    () => ({
      mode,
      readOnly,
      // textarea 在按键命令前同步输入，避免移动 contenteditable 延迟回读丢失末字。
      inputStyle: "textarea",
      theme: "tau",
      lineNumbers: false,
      scrollbarStyle: "native",
      viewportMargin: 10,
      workTime: 20,
      workDelay: 100,
      maxHighlightLength: 10000,
      lineWrapping,
      smartIndent: true,
      extraKeys: { "Shift-Tab": "indentLess" },
      indentUnit: 2,
      tabSize: 2,
      cursorHeight: 1,
      autoCloseBrackets: true,
      tabindex: -1,
    }),
    [mode, readOnly, lineWrapping]
  );
  return <UnControlled {...props} options={options} />;
}
