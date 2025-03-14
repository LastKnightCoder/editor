import { Editor, Transforms } from "slate";

export const normalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (node.type !== "card-link") {
      return normalizeNode([node, path]);
    }

    // 如果 card-link 不是在 paragraph 里面，就把它包裹在 paragraph 里面
    const parentPath = path.slice(0, path.length - 1);
    const parentNode = Editor.node(editor, parentPath);
    if (
      path.length === 0 ||
      (parentNode && parentNode[0].type !== "paragraph")
    ) {
      // 将 card-link 包裹在 paragraph 里面
      Transforms.wrapNodes(
        editor,
        {
          type: "paragraph",
          // @ts-ignore
          children: [node],
        },
        {
          at: path,
        },
      );

      return;
    }

    return normalizeNode([node, path]);
  };

  return editor;
};
