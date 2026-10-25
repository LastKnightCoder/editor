import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import Board from "../Board";
import { BoardContext } from "../context";
import {
  TextEditor,
  TextExtensionContext,
  embeddedTextOptions,
  type WhiteboardTextEditorProps,
} from "../extensions/text";

it("独立正文编辑器显式可写，元素只读与画布冻结都禁止输入", async () => {
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  const host = document.createElement("div"),
    root = createRoot(host);
  let received: WhiteboardTextEditorProps | undefined;
  const options = {
    ...embeddedTextOptions,
    Editor: (props: WhiteboardTextEditorProps) => {
      received = props;
      return null;
    },
  };
  const render = (readonly?: boolean) =>
    act(async () =>
      root.render(
        <BoardContext value={board}>
          <TextExtensionContext value={options}>
            <TextEditor contentId={7} readonly={readonly} />
          </TextExtensionContext>
        </BoardContext>
      )
    );
  try {
    await render();
    expect(received).toMatchObject({ contentId: 7, readonly: false });
    await render(true);
    expect(received?.readonly).toBe(true);
    await render(false);
    await act(async () => {
      board.readonly = true;
    });
    expect(received?.readonly).toBe(true);
    await act(async () => {
      board.readonly = false;
    });
    expect(received?.readonly).toBe(false);
  } finally {
    await act(async () => root.unmount());
    board.destroy();
  }
});
