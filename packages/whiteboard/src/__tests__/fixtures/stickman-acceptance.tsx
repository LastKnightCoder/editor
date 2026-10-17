import { renderToStaticMarkup } from "react-dom/server";
import type { WhiteboardAPI, WhiteboardElementDefinition } from "../../extensions/api";
import { defineWhiteboardExtension } from "../../extensions/api";
import { WhiteboardAPIProvider } from "../../extensions/context";
import baseline from "./stickman-baseline.json";
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

/** 对照迁移前已逐项核对的摘要，不在宿主保留人物模型或第二份渲染实现。 */
export async function checkStickmanParity(
  api: WhiteboardAPI,
  definition: WhiteboardElementDefinition
) {
  let renderCases = 0;
  let schematicCases = 0;
  const renders: string[] = [];
  const schematics: string[] = [];
  const Figure = definition.render;
  for (const pose of baseline.poses)
    for (const body of ["classic", "bean", "glyph"] as const)
      for (const tint of ["mono", "color"] as const)
        for (const flip of [false, true]) {
          const data = { pose, body, tint, flip };
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
              const inner = actual
                .slice(actual.indexOf("<g"), actual.lastIndexOf("</svg>"))
                .replaceAll('class="tau-stickman-text"', 'class="font-medium"');
              renders.push(inner);
              renderCases++;
            }
          for (const dark of [false, true]) {
            const current = buildSchematic(
              [{ ...base, type: definition.type, schemaVersion: 1, data }],
              { aspect: 2, dark, definitions: [definition] }
            );
            schematics.push(JSON.stringify(current));
            schematicCases++;
          }
        }
  const digest = async (value: unknown) =>
    Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)))
      )
    )
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  const renderDigest = await digest(renders),
    schematicDigest = await digest(schematics);
  if (
    renderCases !== baseline.renderCases ||
    schematicCases !== baseline.schematicCases ||
    renderDigest !== baseline.renderDigest ||
    schematicDigest !== baseline.schematicDigest
  )
    throw new Error("人物渲染或缩略图与迁移基线不一致");
  return { renderCases, schematicCases, renderDigest, schematicDigest };
}
