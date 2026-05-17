import { Editor, Node, Path } from "slate";
import { ReactEditor } from "slate-react";

export const getPrevPath = (path: Path) => {
  const isFirst = path[path.length - 1] === 0;
  if (isFirst) {
    return undefined;
  }
  return Path.previous(path);
};

export const getNextPath = (path: Path) => {
  return Path.next(path);
};

export const getParentPath = (path: Path) => {
  return path.slice(0, path.length - 1);
};

export const findPathSafely = (
  editor: Editor,
  node: Node,
): Path | undefined => {
  try {
    return ReactEditor.findPath(editor as ReactEditor, node);
  } catch {
    return undefined;
  }
};

export const getNodeAtPathSafely = (editor: Editor, path: Path) => {
  try {
    if (!Node.has(editor, path)) {
      return undefined;
    }
    return Node.get(editor, path);
  } catch {
    return undefined;
  }
};
