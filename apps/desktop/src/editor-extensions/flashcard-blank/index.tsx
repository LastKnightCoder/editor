import { RenderElementProps } from "slate-react";
import { Base, IExtension } from "@tau/editor/src";
import type { FlashcardBlankElement } from "./types";
import FlashcardBlank from "./components/FlashcardBlank";
import { withSetting } from "./plugins";
export type { FlashcardBlankElement } from "./types";

interface FlashcardBlankExtensionOptions {
  isDark?: boolean;
}

class FlashcardBlankExtension extends Base implements IExtension {
  type = "flashcard-blank";
  private options: FlashcardBlankExtensionOptions;

  constructor(options: FlashcardBlankExtensionOptions = {}) {
    super();
    this.options = options;
  }

  override getPlugins() {
    return [withSetting];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;

    return (
      <FlashcardBlank
        attributes={attributes}
        element={element as unknown as FlashcardBlankElement}
        isDark={this.options.isDark}
      >
        {children}
      </FlashcardBlank>
    );
  }
}

export default FlashcardBlankExtension;
