import { defineExtension } from "@tau/editor/api";
import { TEXT_FORMATTING_KEYS } from "./types.ts";
import FormattedText from "./rendering/index.tsx";
import toolbar from "./hovering-bar-configs/index.ts";
import { inlineCode } from "./plugins/inlineCode.ts";
import { colorCommands } from "./colorCommands.ts";
import {
  formattedTextCommands,
  formattedTextHotkeys,
  quitFormattedMarksCommands,
  quitFormattedMarksHotkeys,
} from "./commands.ts";

export const textFormattingExtension = defineExtension({
  id: "tau.text-formatting",
  marks: [
    {
      id: "tau.text-formatting.render",
      keys: TEXT_FORMATTING_KEYS,
      render: FormattedText,
    },
  ],
  toolbar,
  plugins: [inlineCode],
  commands: [...formattedTextCommands, ...quitFormattedMarksCommands, ...colorCommands],
  hotkeys: [...formattedTextHotkeys, ...quitFormattedMarksHotkeys].map(hotkey => ({
    ...hotkey,
    fallback: true,
  })),
});
