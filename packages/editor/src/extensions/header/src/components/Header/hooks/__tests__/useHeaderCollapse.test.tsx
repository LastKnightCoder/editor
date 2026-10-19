import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, type Descendant, type Node, type Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useHeaderCollapse from "../useHeaderCollapse";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createHeader = (text: string, collapsed = true) => ({
  type: "header" as const,
  level: 2 as const,
  collapsed,
  children: [{ type: "formatted" as const, text }],
});

const findNodePath = (
  descendants: Descendant[],
  target: Node,
  parentPath: Path = []
): Path | null => {
  for (let index = 0; index < descendants.length; index++) {
    const node = descendants[index] as Node;
    const path = [...parentPath, index];
    if (node === target) {
      return path;
    }
    if ("children" in node) {
      const childPath = findNodePath(node.children as Descendant[], target, path);
      if (childPath) {
        return childPath;
      }
    }
  }
  return null;
};

const HookHarness = ({
  editor,
  element,
  onReady,
}: {
  editor: ReturnType<typeof createEditor>;
  element: ReturnType<typeof createHeader>;
  onReady: (value: { toggleCollapse: (e: React.MouseEvent) => void }) => void;
}) => {
  const hookValue = useHeaderCollapse({ editor, element });

  useEffect(() => {
    onReady(hookValue);
  }, [hookValue, onReady]);

  return null;
};

describe("useHeaderCollapse", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(ReactEditor, "findPath").mockImplementation((editor, node) => {
      const path = findNodePath(editor.children as Descendant[], node);
      if (!path) {
        throw new Error(`Unable to find the path for Slate node: ${JSON.stringify(node)}`);
      }
      return path;
    });
    vi.spyOn(ReactEditor, "toDOMNode").mockImplementation((_editor, _node) => {
      return document.createElement("div");
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("标题前插入段落后，toggleCollapse 仍应写入标题当前路径", async () => {
    const setNodesSpy = vi.spyOn(Transforms, "setNodes");
    const editor = createEditor();
    const header = createHeader("标题", true);
    const body = createParagraph("内容");
    let latest:
      | {
          toggleCollapse: (e: React.MouseEvent) => void;
        }
      | undefined;

    editor.children = [header, body] as Descendant[];

    await act(async () => {
      root.render(
        <HookHarness
          editor={editor}
          element={header}
          onReady={value => {
            latest = value;
          }}
        />
      );
    });

    editor.children = [createParagraph("前置段落"), header, body] as Descendant[];

    await act(async () => {
      latest?.toggleCollapse({
        preventDefault() {},
        stopPropagation() {},
      } as React.MouseEvent);
    });

    expect(setNodesSpy).toHaveBeenCalledWith(editor, { collapsed: false }, { at: [1] });
  });
});
