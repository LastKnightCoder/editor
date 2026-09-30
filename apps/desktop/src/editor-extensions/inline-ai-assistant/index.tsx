import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/src";
import hoveringBarConfigs from "./hovering-bar-configs";
import { openComposerCommands, openComposerHotkeys } from "./hotkeys/openComposer";

const inlineAIAssistantExtension = defineExtension({
  id: "host.inline-ai-assistant",
  elements: [
    defineElement({
      type: "inline-ai-assistant",
      kind: "inline",
      render: ({ attributes, children }: ElementRenderProps) => (
        <span {...attributes}>{children}</span>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
  commands: openComposerCommands,
  hotkeys: openComposerHotkeys,
});

export default inlineAIAssistantExtension;
