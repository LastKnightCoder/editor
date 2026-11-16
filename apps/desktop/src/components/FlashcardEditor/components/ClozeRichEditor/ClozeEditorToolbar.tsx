import { Editor, Range, Element as SlateElement } from "slate";
import { Button, toast } from "@tau/ui";
import { wrapAsBlank, unwrapBlank } from "./utils";

interface ClozeEditorToolbarProps {
  editor: Editor;
  isDark: boolean;
}

const ClozeEditorToolbar = ({ editor }: ClozeEditorToolbarProps) => {
  const handleToggleBlank = () => {
    const { selection } = editor;

    if (!selection || Range.isCollapsed(selection)) {
      toast.warning("请先选中需要标记为空格的文字");
      return;
    }

    const [blank] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && n.type === "flashcard-blank",
    });

    if (blank) {
      unwrapBlank(editor);
    } else {
      wrapAsBlank(editor);
    }
  };

  return (
    <div className="border-line-1 flex items-center justify-between border-t px-4 py-3">
      <Button variant="soft" size="sm" onClick={handleToggleBlank}>
        标记为空格
      </Button>

      <span className="text-ink-3 text-tau-sm">提示：选中文字后点击按钮即可标记为空格</span>
    </div>
  );
};

export default ClozeEditorToolbar;
