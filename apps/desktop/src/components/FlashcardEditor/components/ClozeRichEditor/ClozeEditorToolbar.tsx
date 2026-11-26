import { flashcardsTranslator, useFlashcardsI18n } from "@/features/flashcards/i18n";
import { Editor, Range, Element as SlateElement } from "slate";
import { Button, toast } from "@tau/ui";
import { wrapAsBlank, unwrapBlank } from "./utils";

interface ClozeEditorToolbarProps {
  editor: Editor;
  isDark: boolean;
}

const ClozeEditorToolbar = ({ editor }: ClozeEditorToolbarProps) => {
  useFlashcardsI18n();
  const handleToggleBlank = () => {
    const { selection } = editor;

    if (!selection || Range.isCollapsed(selection)) {
      toast.warning(flashcardsTranslator.t("blank.selectText"));
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
        {flashcardsTranslator.t("blank.mark")}
      </Button>

      <span className="text-ink-3 text-tau-sm">{flashcardsTranslator.t("blank.toolbarHint")}</span>
    </div>
  );
};

export default ClozeEditorToolbar;
