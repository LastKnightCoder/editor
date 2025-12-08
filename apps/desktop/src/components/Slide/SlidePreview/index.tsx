import { useRef, useEffect } from "react";
import SlideViewport from "../SlideViewport";
import { SlideDeck, SlidePage } from "@/types/slide";
import { Editor, EditorRef } from "@tau/editor/src";
import { DEFAULT_CARD_CONTENT } from "@/constants";

interface SlidePreviewProps {
  deck?: SlideDeck;
  page?: SlidePage;
}

const SlidePreview = ({ deck, page }: SlidePreviewProps) => {
  const editorRef = useRef<EditorRef>(null);

  // 当 page.content 变化时，通过 ref 同步内容到 Editor
  useEffect(() => {
    if (editorRef.current && page?.content) {
      editorRef.current.setEditorValue(page.content);
    }
  }, [page?.content]);

  if (!deck || !page) {
    return null;
  }

  return (
    <div className="flex flex-col w-full h-full">
      <SlideViewport
        width={deck.width}
        height={deck.height}
        baseFontScale={deck.baseFontScale}
        backgroundImage={page.background?.type === "image" ? page.background.value : undefined}
        className="flex-1 min-h-0"
      >
        <Editor
          ref={editorRef}
          readonly
          initValue={page.content ?? DEFAULT_CARD_CONTENT}
          disableStartExtensions={false}
          className="slide-preview-editor"
        />
      </SlideViewport>
    </div>
  );
};

export default SlidePreview;
