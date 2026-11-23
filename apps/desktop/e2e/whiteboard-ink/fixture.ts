import type { WhiteboardModel, WhiteboardModelCommand } from "@tau/collaboration";
import type { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";

export function seedInk(
  model: WhiteboardModel,
  schema: Awaited<ReturnType<typeof prepareBuiltinWhiteboardTypes>>,
  size: number
) {
  const ink = schema.types.handwrite.contractId;
  const segment = schema.types["host.whiteboard.stroke-segment"].contractId;
  const prepared = schema.prepared.filter(entry => entry.id === ink || entry.id === segment);
  model.submit([{ type: "create_page", id: "p", title: "手写压测" }], null, prepared);
  let commands: WhiteboardModelCommand[] = [];
  for (let index = 0; index < size; index++) {
    const id = "ink-" + index;
    const x = 45 + ((index * 73) % 770),
      y = 75 + ((index * 47) % 495);
    const geometry = { x, y, width: 120, height: 48, rotation: 0 };
    const points = Array.from({ length: 64 }, (_, i) => ({
      x: x + i * 1.8,
      y: y + 24 + 20 * Math.sin(i / 6 + index),
      pressure: 0.5,
    }));
    commands.push(
      {
        type: "create",
        id,
        contractId: ink,
        parent: { kind: "page", id: "p" },
        geometry,
        data: { segmented: true, points: [], outline: [] },
      },
      {
        type: "set_node",
        id,
        patch: {
          name: "手写",
          style: {
            themeColorId: "neutral",
            opacity: 1,
            size: 8,
            thinning: 0.6,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: true,
            startCap: true,
            endCap: true,
          },
        },
      },
      {
        type: "create",
        contractId: segment,
        parent: { kind: "element", id },
        geometry,
        data: { points },
      }
    );
    if (commands.length >= 96 || index === size - 1) {
      model.submit(commands, null);
      commands = [];
    }
  }
}
