import { codeBlockMap } from "./src/extensions/code-block/utils/controllerMaps.ts";
export type { CodeBlockController, CodeCursorPosition } from "./src/extensions/code-block/types.ts";
export const getCodeBlockController = (uuid: string) => codeBlockMap.get(uuid);
