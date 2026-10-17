import { renderToStaticMarkup } from "react-dom/server";
import type { WhiteboardAPI, WhiteboardElementDefinition } from "../../extensions/api";
import { defineWhiteboardExtension } from "../../extensions/api";
import { WhiteboardAPIProvider } from "../../extensions/context";
import StickFigure from "../../components/Stickman/StickFigure";
import { STICK_POSES } from "../../utils/stickman";
import { buildSchematic } from "../../schematic/schematic";
import { useBoard } from "../../hooks/useBoard";
import { useBoardCapture, type CaptureBlob } from "../../hooks/useBoardCapture";
import { ARROW_CONNECT_ID } from "../../constants";

function createCaptureExtension(captureBlob: CaptureBlob) {
  function CaptureLayer() {
    const board = useBoard();
    const { capture, layer } = useBoardCapture(board, captureBlob);
    Object.assign(window, {
      captureWhiteboard: async () => {
        const blob = await capture({
          elements: board.children,
          padding: 16,
          backgroundColor: null,
          dpr: 1,
          type: "png",
          isolateSelection: true,
        });
        return blob && { size: blob.size, type: blob.type };
      },
      checkWhiteboardConnections: () => {
        const node = board.children[0];
        const point = board.getArrowBindPoint(node, ARROW_CONNECT_ID.RIGHT);
        return point?.x === node.x + node.width && point?.y === node.y + node.height / 2;
      },
    });
    return layer;
  }
  return defineWhiteboardExtension({
    id: "verification.export",
    create: () => ({
      layers: [{ id: "verification.export.layer", position: "outside", component: CaptureLayer }],
    }),
  });
}

Object.assign(window, { whiteboardAcceptance: { createCaptureExtension, checkStickmanParity } });

/** 只比较渲染结构与纯图元，不执行视觉验收。旧实现仅在 M3 作为基准。 */
export function checkStickmanParity(api: WhiteboardAPI, definition: WhiteboardElementDefinition) {
  let renderCases = 0;
  let schematicCases = 0;
  const Figure = definition.render;
  for (const pose of STICK_POSES)
    for (const body of ["classic", "bean", "glyph"] as const)
      for (const tint of ["mono", "color"] as const)
        for (const flip of [false, true]) {
          const data = { pose: pose.key, body, tint, flip };
          const base = { id: "parity", x: 20, y: 30, width: 240, height: 180 };
          for (const mode of ["normal", "sketch"] as const)
            for (const level of ["neat", "natural", "loose"] as const) {
              const element = {
                ...base,
                type: definition.type,
                schemaVersion: 1,
                data,
                sketch: { mode, level, seed: 42 },
              };
              const actual = renderToStaticMarkup(
                <WhiteboardAPIProvider value={api}>
                  <Figure element={element} />
                </WhiteboardAPIProvider>
              );
              const expected = renderToStaticMarkup(
                <StickFigure
                  pose={pose}
                  body={body}
                  tint={tint}
                  flip={flip}
                  sketch={{ enabled: mode === "sketch", level, seed: 42 }}
                />
              );
              const inner = actual
                .slice(actual.indexOf("<g"), actual.lastIndexOf("</svg>"))
                .replaceAll('class="tau-stickman-text"', 'class="font-medium"');
              if (inner !== expected)
                throw new Error(`人物渲染不一致：${JSON.stringify({ ...data, mode, level })}`);
              renderCases++;
            }
          for (const dark of [false, true]) {
            const original = buildSchematic([{ ...base, type: "stickman", ...data }], {
              aspect: 2,
              dark,
            });
            const current = buildSchematic(
              [{ ...base, type: definition.type, schemaVersion: 1, data }],
              { aspect: 2, dark, definitions: [definition] }
            );
            if (JSON.stringify(original) !== JSON.stringify(current))
              throw new Error(`人物缩略图不一致：${JSON.stringify(data)}`);
            schematicCases++;
          }
        }
  return { renderCases, schematicCases };
}
