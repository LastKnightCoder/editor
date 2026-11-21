import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhiteboardSession, type BoardElement, type DocumentElement } from "@tau/whiteboard";
import {
  createDocumentExtension,
  createExcerptExtension,
  createInteractionExtension,
} from "@tau/whiteboard/extensions";
import { pickSide } from "../components/Document/SuggestionLayer";
import { neighborsOf } from "../components/Document/ReaderLinks";
import { dropMaterials } from "../components/Document/materialDrag";
import { peekBox } from "../components/Document/PeekLayer";
import { excerptFromAnnotation, placeExcerptBeside } from "../components/Document/excerpt";
import { openExcerptSource } from "../components/Document/ExcerptCard";
import { getDocumentReaderStore } from "../components/Document/readerStore";
import type { ExcerptElement } from "@tau/whiteboard";
import type { PdfAnnotation } from "@/types";

const { resolvePdf, annotations, localPdf } = vi.hoisted(() => ({
  resolvePdf: vi.fn(),
  annotations: vi.fn(),
  localPdf: vi.fn(),
}));
vi.mock("@/commands/whiteboard-document", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/whiteboard-document")>()),
  resolveWhiteboardEntity: resolvePdf,
}));
vi.mock("@/commands/pdf", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/pdf")>()),
  getPdfAnnotations: annotations,
  getPdfById: localPdf,
}));
const openPage = vi.hoisted(() => vi.fn());
vi.mock("@/services/page-navigation", () => ({ openPage }));

vi.mock("@tau/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/ui")>()),
  toast: { info: vi.fn(), error: vi.fn() },
}));

const card = (id: string, x: number, y = 0): DocumentElement => ({
  id,
  type: "document",
  entityRef: { kind: "card", id: Number(id.replace(/\D/g, "")) || 1 },
  x,
  y,
  width: 260,
  height: 240,
});

describe("长出相关的落位", () => {
  it("右侧有元素挡着时换到左侧，左右都挡着时放到下方", () => {
    const source = card("c1", 0);
    expect(pickSide(source, 3, [source]).side).toBe("right");
    const right = card("c2", 360);
    expect(pickSide(source, 3, [source, right]).side).toBe("left");
    const left = card("c3", -560);
    expect(pickSide(source, 3, [source, right, left]).side).toBe("below");
  });

  it("箭头不算占位", () => {
    const source = card("c1", 0);
    const arrow = { id: "a", type: "arrow", x: 300, y: 0, width: 400, height: 240 } as BoardElement;
    expect(pickSide(source, 3, [source, arrow]).side).toBe("right");
  });
});

describe("速览的盒子", () => {
  const layer = { width: 1200, height: 800 };

  it("放大到版宽原大并保持卡片比例，以卡片中心为中心", () => {
    const box = peekBox({ left: 400, top: 300, width: 130, height: 120 }, 460, layer);
    expect(box.width).toBe(460);
    expect(box.height).toBeCloseTo((460 * 120) / 130);
    expect(box.left + box.width / 2).toBeCloseTo(465);
  });

  it("高度放不下时按画布高度缩小，贴边时收进画布", () => {
    const box = peekBox({ left: 1100, top: 700, width: 100, height: 200 }, 620, layer);
    expect(box.height).toBeCloseTo(800 - 48);
    expect(box.left + box.width).toBeLessThanOrEqual(1200 - 24);
    expect(box.top).toBeGreaterThanOrEqual(24);
  });

  it("卡片已经比版宽大时不缩小", () => {
    const box = peekBox({ left: 0, top: 0, width: 700, height: 300 }, 460, layer);
    expect(box.width).toBe(700);
  });
});

describe("阅读纸的相连", () => {
  it("只收两端都在板上的箭头的另一端，同一元素只列一次", () => {
    const a = card("c1", 0);
    const b = card("c2", 400);
    const arrow = (id: string, from: string, to: string) =>
      ({ id, type: "arrow", source: { bindId: from }, target: { bindId: to } }) as BoardElement;
    const children = [
      a,
      { id: "frame", type: "frame", children: [b] },
      arrow("x", "c1", "c2"),
      arrow("y", "c2", "c1"),
      arrow("z", "c1", "gone"),
    ];
    expect(neighborsOf(children, "c1").map(item => item.element.id)).toEqual(["c2"]);
  });
});

const sessions: ReturnType<typeof createWhiteboardSession>[] = [];
afterEach(() => sessions.splice(0).forEach(session => session.dispose()));

function boardWith(children: BoardElement[]) {
  const session = createWhiteboardSession(
    {
      children,
      viewPort: { minX: 0, minY: 0, width: 1200, height: 800, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
      version: 2,
    },
    [createDocumentExtension({}), createExcerptExtension({}), createInteractionExtension()]
  );
  sessions.push(session);
  return session.api;
}

const payload = {
  targets: [{ entityRef: { kind: "article" as const, id: 7 }, title: "新文章" }],
};

describe("物料拖入画布", () => {
  it("落在空白处只放卡不连线", async () => {
    const api = boardWith([card("c1", 0)]);
    await dropMaterials(api, payload, { x: 800, y: 600 });
    expect(api.children.filter(element => element.type === "document")).toHaveLength(2);
    expect(api.children.some(element => element.type === "arrow")).toBe(false);
  });

  it("落在一张卡上时放在它右侧并从它连线", async () => {
    const api = boardWith([card("c1", 0)]);
    await dropMaterials(api, payload, { x: 100, y: 100 });
    const placed = api.children.find(
      element => element.type === "document" && element.id !== "c1"
    )!;
    expect(placed.x).toBeGreaterThan(260);
    expect(api.children.find(element => element.type === "arrow")).toMatchObject({
      source: { bindId: "c1" },
      target: { bindId: placed.id },
    });
  });
});

const pdfCard = (id: string, pdfId: number): DocumentElement => ({
  id,
  type: "document",
  entityRef: { kind: "pdf", id: pdfId },
  x: 0,
  y: 0,
  width: 240,
  height: 340,
});

const highlight = {
  id: 31,
  pdfId: 5,
  createTime: 0,
  updateTime: 0,
  type: "text-markup",
  color: "green",
  annotation: { id: "highlight-uuid", pageIndex: 3, custom: { text: "  注意力是 稀缺资源 " } },
  notes: [],
} as unknown as PdfAnnotation;

describe("摘录", () => {
  it("从标注生成的摘录带原文快照与来源（PDF、标注、页码从 1 开始）", () => {
    expect(excerptFromAnnotation({ id: 5 }, highlight, "注意力经济")).toEqual({
      source: { kind: "pdf", pdfId: 5, annotationId: 31, page: 4 },
      quote: "注意力是 稀缺资源",
      color: "green",
      sourceTitle: "注意力经济",
    });
  });

  it("放到来源卡旁并以虚线连回来源，与连线一起一步撤销", async () => {
    const api = boardWith([pdfCard("p", 5)]);
    const placed = await placeExcerptBeside(
      api,
      api.getElement("p")!,
      excerptFromAnnotation({ id: 5 }, highlight, "注意力经济")
    );
    expect(placed?.x).toBeGreaterThan(240);
    expect(api.children.find(element => element.type === "arrow")).toMatchObject({
      dashed: true,
      source: { bindId: "p" },
      target: { bindId: placed!.id },
    });
    await api.execute("tau.history.undo");
    expect(api.children.map(element => element.id)).toEqual(["p"]);
  });

  it("回到原文：来源卡在板上时展开它并定位到标注；不在板上时打开 PDF 阅读页", async () => {
    localPdf.mockResolvedValue({ id: 5 });
    const excerpt = {
      id: "e",
      type: "excerpt",
      x: 400,
      y: 0,
      width: 280,
      height: 150,
      source: { kind: "pdf", pdfId: 5, annotationId: 31, page: 4 },
    } as ExcerptElement;
    const api = boardWith([pdfCard("p", 5), excerpt]);
    const open = vi.fn();
    api.on("tau.document.open", open);
    await openExcerptSource(api, excerpt);
    expect(open).toHaveBeenCalledWith("p");
    expect(getDocumentReaderStore(api).getState().focus?.annotationId).toBe(31);

    const elsewhere = boardWith([excerpt]);
    await openExcerptSource(elsewhere, excerpt);
    expect(openPage).toHaveBeenCalledWith("pdf-detail", { pdfId: 5, annotation: 31 });
  });
  it("协作摘录按来源和标注身份跳转到接收端的行号，来源无法解析时保留快照", async () => {
    const reference = { kind: "pdf" as const, sourceId: "library", entityId: "stable-pdf" };
    const draft = excerptFromAnnotation({ id: 5 }, highlight, "来源", reference);
    expect(draft.source).toEqual({
      kind: "pdf",
      entity: reference,
      annotationObjectId: "highlight-uuid",
      page: 4,
    });
    const excerpt: ExcerptElement = {
      id: "excerpt",
      type: "excerpt",
      x: 0,
      y: 0,
      width: 280,
      height: 150,
      ...draft,
    };
    const api = boardWith([excerpt]);
    resolvePdf.mockResolvedValueOnce(72).mockResolvedValueOnce(null);
    annotations.mockResolvedValue([{ ...highlight, id: 91, pdfId: 72 }]);
    openPage.mockClear();
    await openExcerptSource(api, excerpt);
    expect(openPage).toHaveBeenCalledWith("pdf-detail", { pdfId: 72, annotation: 91 });
    await openExcerptSource(api, excerpt);
    expect(openPage).toHaveBeenCalledTimes(1);
    expect(api.getElement(excerpt.id)?.quote).toBe("注意力是 稀缺资源");
  });
});
