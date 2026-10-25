import { type EditorKit } from "@tau/editor";
import { codeBlockV2Extension } from "@tau/editor/extensions/code-block";
import { getContentKit } from "@/services/editorKit";
const kits = new WeakMap<EditorKit, EditorKit>();
export function getWhiteboardBodyKit(): EditorKit {
  const base = getContentKit();
  let kit = kits.get(base);
  if (!kit) {
    kit = base.extend({ extensions: [codeBlockV2Extension], override: true });
    kits.set(base, kit);
  }
  return kit;
}
