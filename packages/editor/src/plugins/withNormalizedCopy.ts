import {
  Descendant,
  Editor,
  Element as SlateElement,
  NodeEntry,
  Point,
  Range,
} from "slate";

const FULL_SELECTION_ONLY_TYPES = new Set(["table-cell"]);

const PARTIAL_STRUCTURE_TYPES: Record<string, string> = {
  "bulleted-list": "list-item",
  "numbered-list": "list-item",
  "check-list": "check-list-item",
  table: "table-row",
  "table-row": "table-cell",
  "multi-column-container": "multi-column-item",
};

const MANAGED_TYPES = new Set([
  ...FULL_SELECTION_ONLY_TYPES,
  ...Object.keys(PARTIAL_STRUCTURE_TYPES),
  "highlight-block",
  "blockquote",
  "callout",
  "detail",
  "list-item",
  "check-list-item",
  "multi-column-item",
]);

const ALWAYS_UNWRAP_TYPES = new Set([
  "highlight-block",
  "blockquote",
  "callout",
  "detail",
  "list-item",
  "check-list-item",
  "multi-column-item",
]);

const isManagedElement = (
  node: Descendant,
): node is SlateElement & { type: string; children: Descendant[] } => {
  return SlateElement.isElement(node) && MANAGED_TYPES.has(String(node.type));
};

const isFullyCovered = (
  editor: Editor,
  selection: NonNullable<Editor["selection"]>,
  path: number[],
): boolean => {
  const [selectionStart, selectionEnd] = Range.edges(selection);
  const [nodeStart, nodeEnd] = Range.edges(Editor.range(editor, path));
  return (
    Point.compare(selectionStart, nodeStart) <= 0 &&
    Point.compare(selectionEnd, nodeEnd) >= 0
  );
};

const getIntersectingChildEntries = (
  editor: Editor,
  selection: NonNullable<Editor["selection"]>,
  path: number[],
  node: SlateElement & { children: Descendant[] },
): Array<NodeEntry<Descendant>> => {
  return node.children.flatMap((child, index) => {
    const childPath = [...path, index];
    const childRange = Editor.range(editor, childPath);
    if (!Range.intersection(selection, childRange)) {
      return [];
    }
    return [[child, childPath] as NodeEntry<Descendant>];
  });
};

const normalizeManagedNode = (
  editor: Editor,
  selection: NonNullable<Editor["selection"]>,
  originalNode: SlateElement & { type: string; children: Descendant[] },
  fragmentNode: SlateElement & { type: string; children: Descendant[] },
  path: number[],
): Descendant[] => {
  const intersectingChildren = getIntersectingChildEntries(
    editor,
    selection,
    path,
    originalNode,
  );

  const normalizedChildren =
    intersectingChildren.length === fragmentNode.children.length
      ? fragmentNode.children.flatMap((child, index) => {
          const originalChildEntry = intersectingChildren[index];
          if (!originalChildEntry || !isManagedElement(child)) {
            return [child];
          }

          const [originalChild, childPath] = originalChildEntry;
          if (
            !isManagedElement(originalChild) ||
            originalChild.type !== child.type
          ) {
            return [child];
          }

          return normalizeManagedNode(
            editor,
            selection,
            originalChild,
            child,
            childPath,
          );
        })
      : fragmentNode.children;

  if (ALWAYS_UNWRAP_TYPES.has(fragmentNode.type)) {
    return normalizedChildren;
  }

  if (FULL_SELECTION_ONLY_TYPES.has(fragmentNode.type)) {
    if (isFullyCovered(editor, selection, path)) {
      return [
        {
          ...fragmentNode,
          children: normalizedChildren,
        } as unknown as Descendant,
      ];
    }
    return normalizedChildren;
  }

  const expectedChildType = PARTIAL_STRUCTURE_TYPES[fragmentNode.type];
  const canKeepPartialStructure =
    normalizedChildren.length > 0 &&
    normalizedChildren.every((child) => {
      return SlateElement.isElement(child) && child.type === expectedChildType;
    });

  if (isFullyCovered(editor, selection, path) || canKeepPartialStructure) {
    return [
      {
        ...fragmentNode,
        children: normalizedChildren,
      } as unknown as Descendant,
    ];
  }

  return normalizedChildren;
};

export const normalizeCopiedFragment = (
  editor: Editor,
  fragment: Descendant[],
  selection = editor.selection,
): Descendant[] => {
  if (!selection || Range.isCollapsed(selection) || fragment.length === 0) {
    return fragment;
  }

  const highestSelectedBlocks = Array.from(
    Editor.nodes(editor, {
      at: selection,
      match: (node) =>
        SlateElement.isElement(node) && Editor.isBlock(editor, node),
      mode: "highest",
    }),
  ) as Array<NodeEntry<SlateElement>>;

  if (highestSelectedBlocks.length !== fragment.length) {
    return fragment;
  }

  const normalized = fragment.flatMap((fragmentNode, index) => {
    if (!isManagedElement(fragmentNode)) {
      return [fragmentNode];
    }

    const originalEntry = highestSelectedBlocks[index];
    if (!originalEntry) {
      return [fragmentNode];
    }

    const [originalNode, path] = originalEntry;
    if (
      !isManagedElement(originalNode) ||
      originalNode.type !== fragmentNode.type
    ) {
      return [fragmentNode];
    }

    return normalizeManagedNode(
      editor,
      selection,
      originalNode,
      fragmentNode,
      path,
    );
  });

  const shouldDebug =
    typeof globalThis !== "undefined" &&
    Boolean((globalThis as any).__TAU_EDITOR_DEBUG_CLIPBOARD__);

  if (shouldDebug) {
    console.info("[editor.copy.normalize]", {
      selection,
      fragment,
      normalized,
    });
  }

  return normalized;
};

export const withNormalizedCopy = (editor: Editor) => {
  const { getFragment } = editor;

  editor.getFragment = () => {
    const fragment = getFragment();
    return normalizeCopiedFragment(editor, fragment);
  };

  return editor;
};
