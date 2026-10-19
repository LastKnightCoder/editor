import { Editor, NodeEntry, Path, Transforms } from "slate";

export const exitContainerOnEmptyParagraph = (editor: Editor, parentType: string) => {
  const [parentMatch] = Editor.nodes(editor, {
    match: n => n.type === parentType,
    mode: "lowest",
  });

  const [paraMatch] = Editor.nodes(editor, {
    match: n => n.type === "paragraph",
    mode: "lowest",
  });

  if (
    !parentMatch ||
    !paraMatch ||
    paraMatch[1].length !== parentMatch[1].length + 1 ||
    paraMatch[1][paraMatch[1].length - 1] !== (parentMatch[0] as any).children.length - 1 ||
    !Editor.isEmpty(editor, paraMatch[0] as any)
  ) {
    return false;
  }

  if (paraMatch[1][paraMatch[1].length - 1] === 0) {
    Transforms.liftNodes(editor, {
      at: paraMatch[1],
    });
    return true;
  }

  // 删除当前段落
  Transforms.delete(editor, {
    at: paraMatch[1],
  });
  // 在容器下方添加一个新段落
  Transforms.insertNodes(
    editor,
    {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    },
    {
      at: Path.next(parentMatch[1]),
      select: true,
    }
  );

  return true;
};

export const hitEmptyOrInlineChild = (
  editor: Editor,
  [node, path]: NodeEntry,
  parentType: string
) => {
  if (node.type !== parentType) {
    return false;
  }

  // @ts-ignore
  if (!node.children) {
    return false;
  }

  // @ts-ignore
  if (node.children.length === 0) {
    Transforms.removeNodes(editor, {
      at: path,
    });
    return true;
  }

  // @ts-ignore
  if (node.children.length === 1 && node.children[0].type === "formatted") {
    // @ts-ignore
    if (node.children[0].text === "") {
      Transforms.removeNodes(editor, {
        at: path,
      });
      return true;
    } else {
      Transforms.wrapNodes(
        editor,
        {
          type: "paragraph",
          children: [],
        },
        {
          at: [...path, 0],
        }
      );
    }
    return true;
  }

  return false;
};
