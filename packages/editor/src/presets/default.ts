import type { EditorExtension } from "../core/api/extension";
import { standardExtensions } from "./standard";
import codeBlock from "../extensions/code-block/src";
import { diagramExtensions } from "../extensions/diagram/src";
import { mathExtensions } from "../extensions/math/src";
import emoji from "../extensions/emoji/src";

export const defaultExtensions: readonly EditorExtension[] = [
  ...standardExtensions,
  codeBlock,
  ...diagramExtensions,
  ...mathExtensions,
  emoji,
];
