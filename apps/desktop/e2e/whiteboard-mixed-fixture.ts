import type { WhiteboardModelCommand } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import type { WhiteboardModel } from "@tau/collaboration";
import type { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";

export async function addMixedScene(
  model: WhiteboardModel,
  schema: Awaited<ReturnType<typeof prepareBuiltinWhiteboardTypes>>,
  groups = 240
) {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const types = ["geometry", "richtext", "arrow"] as const;
  const contracts = new Set(types.map(type => schema.types[type].contractId));
  await model.installContracts({
    [paragraph.id]: paragraph.contract,
    ...Object.fromEntries(
      schema.prepared.filter(row => contracts.has(row.id)).map(row => [row.id, row.contract])
    ),
  });
  const body = (text: string) => [
    { type: "paragraph", tauContract: paragraph.id, children: [{ type: "formatted", text }] },
  ];
  const parent = { kind: "page", id: "p" } as const;
  const nodes: WhiteboardModelCommand[] = [];
  for (let i = 0; i < groups; i++) {
    const x = 40 + (i % 16) * 190,
      y = 130 + Math.floor(i / 16) * 168;
    for (const [side, offset] of [
      ["a", 0],
      ["b", 100],
    ] as const) {
      nodes.push({
        type: "create",
        id: `shape-${side}-${i}`,
        parent,
        contractId: schema.types.geometry.contractId,
        geometry: { x: x + offset, y, width: 56, height: 28, rotation: 0 },
        data: {
          geometryType: "rectangle",
          paths: ["M 0 0 L 1 0 L 1 1 L 0 1 Z"],
          fill: "#87aab2",
          fillOpacity: 1,
          stroke: "#456",
          strokeWidth: 1,
          strokeOpacity: 1,
          color: "#123",
          extraInfo: {},
          text: { align: "center" },
        },
        body: body(side === "a" ? "输入" : "输出"),
      });
    }
    nodes.push({
      type: "create",
      id: `text-${i}`,
      parent,
      contractId: schema.types.richtext.contractId,
      geometry: { x, y: y + 32, width: 155, height: 44, rotation: 0 },
      data: { maxWidth: 155, maxHeight: 44, resized: true, readonly: false },
      body: body(`第 ${i + 1} 组的处理记录与复核备注`),
    });
    nodes.push({
      type: "create",
      id: `line-${i}`,
      parent,
      contractId: schema.types.arrow.contractId,
      geometry: { x: x + 56, y: y + 14, width: 44, height: 1, rotation: 0 },
      data: {
        lineType: "straight",
        lineWidth: 2,
        themeColorId: "neutral",
        source: { marker: "none", bindId: `shape-a-${i}`, connectId: "right" },
        target: { marker: "arrow", bindId: `shape-b-${i}`, connectId: "left" },
        points: [
          { x: x + 56, y: y + 14 },
          { x: x + 100, y: y + 14 },
        ],
      },
    });
  }
  for (let offset = 0; offset < nodes.length; offset += 128)
    model.submit(nodes.slice(offset, offset + 128), null);
}
