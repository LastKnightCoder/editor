import { RenderElementProps } from "slate-react";
import { Base, IExtension } from "@tau/editor/src";
import type { FlashcardBlankElement } from "./types";
import FlashcardBlank from "./components/FlashcardBlank";
import { withSetting } from "./plugins";
export type { FlashcardBlankElement } from "./types";

class FlashcardBlankExtension extends Base implements IExtension {
  type = "flashcard-blank";

  override getPlugins() {
    return [withSetting];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;

    return (
      <FlashcardBlank attributes={attributes} element={element as unknown as FlashcardBlankElement}>
        {children}
      </FlashcardBlank>
    );
  }
}

export default FlashcardBlankExtension;
