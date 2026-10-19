import type { AnyExtension } from "../core/api/legacy";
import { standardExtensions } from "./standard";
import codeBlock from "../extensions/code-block/src";
import { diagramExtensions } from "../extensions/diagram/src";
import { mathExtensions } from "../extensions/math/src";
import emoji from "../extensions/emoji/src";

export const defaultExtensions: readonly AnyExtension[] = [
  ...standardExtensions,
  codeBlock,
  ...diagramExtensions,
  ...mathExtensions,
  emoji,
];
