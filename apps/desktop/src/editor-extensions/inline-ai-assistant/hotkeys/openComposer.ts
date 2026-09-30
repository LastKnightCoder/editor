import type { EditorCommand, EditorHotkey } from "@tau/editor/src";
import { toggleInlineAIComposer } from "../panel-manager";

export const openComposerCommands: EditorCommand[] = [
  {
    id: "host.inline-ai.open-composer",
    title: "打开行内 AI 改写",
    run: (editor, ctx) => {
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
      toggleInlineAIComposer(editor, "hotkey");
    },
  },
];

export const openComposerHotkeys: EditorHotkey[] = [
  { key: "mod+j", command: "host.inline-ai.open-composer" },
];
