import { useMemo } from "react";
import { Descendant } from "slate";
import { Editor, IExtension } from "@tau/editor/src";
import FlashcardBlankExtension from "@/editor-extensions/flashcard-blank";

interface RichTextRendererProps {
  content: Descendant[];
  isDark?: boolean;
  className?: string;
}

const RichTextRenderer = ({ content, isDark = false, className = "" }: RichTextRendererProps) => {
  // 配置扩展
  const extensions = useMemo<IExtension[]>(() => {
    return [new FlashcardBlankExtension()];
  }, [isDark]);

  return (
    <div className={className}>
      <Editor
        initValue={content}
        readonly={true}
        extensions={extensions}
        style={{
          outline: "none",
          cursor: "default",
        }}
      />
    </div>
  );
};

export default RichTextRenderer;
