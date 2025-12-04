import SlideViewport from "../SlideViewport";
import { SlideDeck, SlidePage } from "@/types/slide";
import Editor from "@/components/Editor";
import { DEFAULT_CARD_CONTENT } from "@/constants";
interface SlidePreviewProps {
  deck?: SlideDeck;
  page?: SlidePage;
}

const SlidePreview = ({ deck, page }: SlidePreviewProps) => {
  if (!deck || !page) {
    return null;
  }

  return (
    <div className="flex flex-col w-full h-full">
      <SlideViewport
        width={deck.width}
        height={deck.height}
        baseFontScale={deck.baseFontScale}
        className="flex-1 min-h-0"
      >
        <Editor
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
