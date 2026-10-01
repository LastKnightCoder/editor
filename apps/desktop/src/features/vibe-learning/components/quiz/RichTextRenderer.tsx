import { getFlashcardKit } from "@/services/editorKit";
import { Descendant } from "slate";
import { Editor } from "@tau/editor";

interface RichTextRendererProps {
  content: Descendant[];
  className?: string;
}

const RichTextRenderer = ({ content, className = "" }: RichTextRendererProps) => {
  return (
    <div className={className}>
      <Editor
        kit={getFlashcardKit()}
        initValue={content}
        readonly={true}
        style={{
          outline: "none",
          cursor: "default",
        }}
      />
    </div>
  );
};

export default RichTextRenderer;
