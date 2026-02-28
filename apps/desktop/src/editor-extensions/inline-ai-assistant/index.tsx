import { RenderElementProps } from "slate-react";
import { Base, IExtension } from "@tau/editor/src";
import hoveringBarConfigs from "./hovering-bar-configs";
import { openInlineAIComposerHotkey } from "./hotkeys/openComposer";

class InlineAIAssistantExtension extends Base implements IExtension {
  type = "inline-ai-assistant";

  override getHotkeyConfigs() {
    return openInlineAIComposerHotkey;
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  render(props: RenderElementProps) {
    const { attributes, children } = props;
    return <span {...attributes}>{children}</span>;
  }
}

export default InlineAIAssistantExtension;
