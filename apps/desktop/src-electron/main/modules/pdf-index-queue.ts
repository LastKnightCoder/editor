import { ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import log from "electron-log";
import type { Module } from "../types/module";
import type {
  PdfDocumentMap,
  PdfDocumentInfo,
  PdfIndexStatus,
  PdfOutlineNode,
  PdfSearchResult,
} from "@/types";
import type { EmbeddingProviderType } from "@/types/embedding";
import databaseModule from "./database";
import userSettingModule from "./user-setting";
import pdfIndexDBManager, { type PdfIndexChunkRecord, type PdfSectionRecord } from "./pdf-index-db";
import PdfTable from "./tables/pdf";
import localInference from "./local-inference";
import { runSearchPipeline } from "./search-core/pipeline";
import { createPdfSearchAdapter } from "./search-core/pdf-search-adapter";
import { resolveEmbeddingConfig } from "../utils/embedding-config";
import { shouldReusePdfIndex } from "./pdf-index-reuse";

export interface EnsurePdfIndexParams {
  pdfId: number;
  resolvedPath: string;
  fileName: string;
  mainDbName: string;
  force?: boolean;
}

interface SearchPdfParams {
  pdfId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}

interface ResolvedPdfEmbeddingConfig {
  providerType: EmbeddingProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  dimensions: number;
  distance: number;
  batchSize: number;
  devicePolicy: "auto" | "cpu" | "cuda";
  localModelDir?: string;
  fingerprint: string;
}

interface PdfPageExtraction {
  pageNumber: number;
  content: string;
  charCount: number;
}

interface ExtractPdfResult {
  pageCount: number;
  pages: PdfPageExtraction[];
  outline: PdfOutlineNode[];
}

interface PdfSectionDraft {
  id: string;
  parentId: string | null;
  title: string;
  level: number;
  startPage: number | null;
  endPage: number | null;
  orderIndex: number;
  pathTitles: string[];
  source: "outline" | "inferred" | "synthetic";
  children: PdfSectionDraft[];
}

interface PdfHeadingCandidate {
  title: string;
  pageNumber: number;
  level: number;
  score: number;
}

interface PdfOutlineItemInput {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineItemInput[];
}

const DEFAULT_CHUNK_MAX = 1800;
const DEFAULT_CHUNK_MIN = 400;

class PdfIndexQueue implements Module {
  name = "pdf-index-queue";
  private inFlight = new Map<string, Promise<PdfIndexStatus>>();
  private activeMainDbName: string | null = null;
  private progressByTaskKey = new Map<
    string,
    Pick<PdfIndexStatus, "currentStage" | "progressCurrent" | "progressTotal" | "progressLabel">
  >();

  async init() {
    this.activeMainDbName = databaseModule.getCurrentDatabaseName();

    ipcMain.handle("pdf-index:ensure", async (_event, params: EnsurePdfIndexParams) => {
      return this.ensureIndexed(params);
    });
    ipcMain.handle("pdf-index:rebuild", async (_event, params: EnsurePdfIndexParams) => {
      return this.ensureIndexed({ ...params, force: true });
    });
    ipcMain.handle(
      "pdf-index:status",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        this.getIndexStatus(params.mainDbName, params.pdfId)
    );
    // 列表页批量查询：没有索引库的 PDF 不在结果里（视为未索引），不为查询而建库
    ipcMain.handle(
      "pdf-index:status-batch",
      async (_event, params: { pdfIds: number[]; mainDbName: string }) =>
        params.pdfIds
          .filter(pdfId => pdfIndexDBManager.hasDatabase(params.mainDbName, pdfId))
          .map(pdfId => this.getIndexStatus(params.mainDbName, pdfId))
    );
    ipcMain.handle("pdf-index:search", async (_event, params: SearchPdfParams) => {
      return this.searchContent(params);
    });
    ipcMain.handle(
      "pdf-index:document-info",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        this.getDocumentInfo(params.mainDbName, params.pdfId)
    );
    ipcMain.handle(
      "pdf-index:page-content",
      async (_event, params: { pdfId: number; mainDbName: string; pageNumber: number }) =>
        pdfIndexDBManager.getPageContent(params.mainDbName, params.pdfId, params.pageNumber)
    );
    ipcMain.handle(
      "pdf-index:page-range-content",
      async (
        _event,
        params: {
          pdfId: number;
          mainDbName: string;
          startPage: number;
          endPage: number;
        }
      ) =>
        pdfIndexDBManager.getPageRangeContent(
          params.mainDbName,
          params.pdfId,
          params.startPage,
          params.endPage
        )
    );
    ipcMain.handle(
      "pdf-index:outline",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        pdfIndexDBManager.getOutline(params.mainDbName, params.pdfId)
    );
    ipcMain.handle(
      "pdf-index:document-map",
      async (_event, params: { pdfId: number; mainDbName: string; depth?: number }) =>
        this.getDocumentMap(params.mainDbName, params.pdfId, params.depth)
    );
    ipcMain.handle(
      "pdf-index:section-detail",
      async (_event, params: { pdfId: number; mainDbName: string; sectionId: string }) =>
        pdfIndexDBManager.getSectionDetail(params.mainDbName, params.pdfId, params.sectionId)
    );

    databaseModule.onDatabaseChange(dbName => {
      const previousDbName = this.activeMainDbName;
      this.activeMainDbName = dbName;
      if (!previousDbName || previousDbName === dbName) {
        return;
      }
      pdfIndexDBManager.closeAllForMainDB(previousDbName);
    });

    log.info("[PdfIndexQueue] Module initialized");
  }

  private buildTaskKey(params: EnsurePdfIndexParams): string {
    return `${params.mainDbName}:${params.pdfId}`;
  }

  private getIndexStatus(mainDbName: string, pdfId: number): PdfIndexStatus {
    const status = pdfIndexDBManager.getIndexStatus(mainDbName, pdfId);
    const progress = this.progressByTaskKey.get(`${mainDbName}:${pdfId}`);
    return progress ? { ...status, ...progress } : status;
  }

  private updateProgress(
    taskKey: string,
    progress: Pick<
      PdfIndexStatus,
      "currentStage" | "progressCurrent" | "progressTotal" | "progressLabel"
    >
  ) {
    this.progressByTaskKey.set(taskKey, progress);
  }

  async ensureIndex(params: EnsurePdfIndexParams): Promise<PdfIndexStatus> {
    return this.ensureIndexed(params);
  }

  private async ensureIndexed(params: EnsurePdfIndexParams): Promise<PdfIndexStatus> {
    const key = this.buildTaskKey(params);
    const current = this.inFlight.get(key);
    if (current) {
      return current;
    }
    const task = this.runEnsureIndexed(params).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }

  private async runEnsureIndexed(params: EnsurePdfIndexParams): Promise<PdfIndexStatus> {
    const { pdfId, resolvedPath, mainDbName, force = false } = params;
    const taskKey = this.buildTaskKey(params);
    const stat = await fs.stat(resolvedPath);
    const fingerprint = `${resolvedPath}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    const currentStatus = pdfIndexDBManager.getIndexStatus(mainDbName, pdfId);
    const embeddingConfig = await this.getEmbeddingConfig();
    const currentEmbeddingFingerprint = pdfIndexDBManager.getEmbeddingFingerprint(
      mainDbName,
      pdfId
    );

    if (
      shouldReusePdfIndex({
        force,
        currentState: currentStatus.state,
        currentFingerprint: currentStatus.fingerprint,
        nextFingerprint: fingerprint,
        currentEmbeddingFingerprint,
        nextEmbeddingFingerprint: embeddingConfig?.fingerprint,
      })
    ) {
      return currentStatus;
    }

    pdfIndexDBManager.setIndexState(mainDbName, pdfId, "building", {
      fingerprint,
      error: null,
    });
    this.updateProgress(taskKey, {
      currentStage: "extracting",
      progressCurrent: 0,
      progressTotal: 0,
      progressLabel: "开始解析 PDF",
    });

    try {
      const extracted = await this.extractPdf(resolvedPath, progress => {
        this.updateProgress(taskKey, progress);
      });
      this.updateProgress(taskKey, {
        currentStage: "structuring",
        progressCurrent: 0,
        progressTotal: extracted.pageCount,
        progressLabel: "构建章节结构",
      });
      const sections = this.buildSections(extracted.outline, extracted.pages);
      const chunks = this.chunkPages(extracted.pages);
      this.updateProgress(taskKey, {
        currentStage: "embedding",
        progressCurrent: 0,
        progressTotal: chunks.length,
        progressLabel: chunks.length > 0 ? "开始生成向量" : "无需生成向量",
      });
      let embeddings: number[][] | undefined;
      if (embeddingConfig) {
        if (chunks.length > 0) {
          embeddings = await this.embedTexts(
            chunks.map(chunk => chunk.content),
            embeddingConfig,
            current => {
              this.updateProgress(taskKey, {
                currentStage: "embedding",
                progressCurrent: current,
                progressTotal: chunks.length,
                progressLabel: `生成向量 ${current}/${chunks.length}`,
              });
            }
          );
        }
      }
      this.updateProgress(taskKey, {
        currentStage: "persisting",
        progressCurrent: sections.length,
        progressTotal: sections.length,
        progressLabel: "写入索引",
      });

      const status = pdfIndexDBManager.persistIndex(mainDbName, pdfId, {
        fingerprint,
        pageCount: extracted.pageCount,
        pages: extracted.pages.map(page => ({
          pdfId,
          pageNumber: page.pageNumber,
          content: page.content,
          charCount: page.charCount,
        })),
        chunks,
        outline: extracted.outline,
        sections,
        embeddings,
        vecDimensions: embeddingConfig?.dimensions,
        embeddingFingerprint: embeddingConfig?.fingerprint,
      });
      this.progressByTaskKey.delete(taskKey);
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.progressByTaskKey.delete(taskKey);
      return pdfIndexDBManager.setIndexState(mainDbName, pdfId, "failed", {
        fingerprint,
        error: message,
      });
    }
  }

  private async getEmbeddingConfig(): Promise<ResolvedPdfEmbeddingConfig | null> {
    const setting = await userSettingModule.getSettingSnapshot();
    const resolved = resolveEmbeddingConfig(setting);
    if (!resolved) {
      return null;
    }
    return {
      providerType: resolved.providerType,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      dimensions: resolved.dimensions,
      distance: resolved.distance,
      batchSize: resolved.batchSize,
      devicePolicy: resolved.devicePolicy,
      localModelDir: resolved.localModelDir,
      fingerprint: resolved.fingerprint,
    };
  }

  private async embedTexts(
    texts: string[],
    embeddingConfig: ResolvedPdfEmbeddingConfig,
    onProgress?: (current: number, total: number) => void,
    interactive = false
  ): Promise<number[][]> {
    if (embeddingConfig.providerType === "local_python") {
      const result = await localInference.embedTexts(texts, {
        modelDir: embeddingConfig.localModelDir,
        modelName: embeddingConfig.model,
        batchSize: embeddingConfig.batchSize || 8,
        devicePolicy: embeddingConfig.devicePolicy || "auto",
        priority: interactive ? "interactive" : "background",
      });
      onProgress?.(texts.length, texts.length);
      return result.embeddings || [];
    }

    if (!embeddingConfig.apiKey || !embeddingConfig.baseUrl) {
      return [];
    }

    const client = new OpenAI({
      apiKey: embeddingConfig.apiKey,
      baseURL: embeddingConfig.baseUrl,
    });
    const result = await client.embeddings.create({
      model: embeddingConfig.model,
      input: texts,
      dimensions: embeddingConfig.dimensions,
    });
    onProgress?.(texts.length, texts.length);
    return result.data.map(item => item.embedding);
  }

  private async extractPdf(
    resolvedPath: string,
    onProgress?: (
      progress: Pick<
        PdfIndexStatus,
        "currentStage" | "progressCurrent" | "progressTotal" | "progressLabel"
      >
    ) => void
  ): Promise<ExtractPdfResult> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = path.join(__dirname, "pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    const buffer = await fs.readFile(resolvedPath);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    } as any);
    const document = await loadingTask.promise;

    try {
      const pages: PdfPageExtraction[] = [];
      onProgress?.({
        currentStage: "extracting",
        progressCurrent: 0,
        progressTotal: document.numPages,
        progressLabel: `解析页面 0/${document.numPages}`,
      });
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const content = this.normalizePageText(
          textContent.items as Array<{ str?: string; hasEOL?: boolean }>
        );
        pages.push({
          pageNumber,
          content,
          charCount: content.length,
        });
        onProgress?.({
          currentStage: "extracting",
          progressCurrent: pageNumber,
          progressTotal: document.numPages,
          progressLabel: `解析页面 ${pageNumber}/${document.numPages}`,
        });
      }

      const rawOutline = ((await document.getOutline()) || []) as PdfOutlineItemInput[];
      const outline = await this.resolveOutline(document, rawOutline);

      return {
        pageCount: document.numPages,
        pages,
        outline,
      };
    } finally {
      await loadingTask.destroy();
    }
  }

  private normalizePageText(items: Array<{ str?: string; hasEOL?: boolean }>): string {
    const parts: string[] = [];
    items.forEach(item => {
      const text = String(item.str || "").trim();
      if (!text) {
        return;
      }
      parts.push(text);
      parts.push(item.hasEOL ? "\n" : " ");
    });

    return parts
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private async resolveOutline(
    document: any,
    items: PdfOutlineItemInput[],
    parentPath = "outline"
  ): Promise<PdfOutlineNode[]> {
    const result: PdfOutlineNode[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const id = `${parentPath}-${index}`;
      const pageNumber = await this.resolveOutlineDestination(document, item.dest);
      result.push({
        id,
        title: String(item.title || "未命名章节"),
        pageNumber,
        orderIndex: index,
        children: await this.resolveOutline(document, item.items || [], id),
      });
    }
    return result;
  }

  private async resolveOutlineDestination(document: any, dest: unknown): Promise<number | null> {
    try {
      let resolvedDest = dest;
      if (typeof dest === "string") {
        resolvedDest = await document.getDestination(dest);
      }
      if (!Array.isArray(resolvedDest) || !resolvedDest[0]) {
        return null;
      }
      const pageIndex = await document.getPageIndex(resolvedDest[0]);
      return Number.isFinite(pageIndex) ? pageIndex + 1 : null;
    } catch {
      return null;
    }
  }

  private buildSections(outline: PdfOutlineNode[], pages: PdfPageExtraction[]): PdfSectionRecord[] {
    const pageCount = pages.length;
    const outlined = this.buildSectionsFromOutline(outline, pageCount);
    const sectionTree = outlined.length > 0 ? outlined : this.inferSectionsFromPages(pages);
    const normalized = this.normalizeSectionTree(sectionTree, pageCount);
    return this.flattenSectionTree(normalized);
  }

  private buildSectionsFromOutline(
    nodes: PdfOutlineNode[],
    pageCount: number,
    parentId: string | null = null,
    level = 1,
    parentPath: string[] = []
  ): PdfSectionDraft[] {
    return nodes.map((node, index) => ({
      id: node.id,
      parentId,
      title: String(node.title || "未命名章节").trim() || "未命名章节",
      level,
      startPage:
        typeof node.pageNumber === "number" && node.pageNumber > 0
          ? Math.min(pageCount, node.pageNumber)
          : null,
      endPage: null,
      orderIndex: index,
      pathTitles: [...parentPath, String(node.title || "未命名章节").trim() || "未命名章节"],
      source: "outline",
      children: this.buildSectionsFromOutline(node.children || [], pageCount, node.id, level + 1, [
        ...parentPath,
        String(node.title || "未命名章节").trim() || "未命名章节",
      ]),
    }));
  }

  private inferSectionsFromPages(pages: PdfPageExtraction[]): PdfSectionDraft[] {
    const candidates = this.collectHeadingCandidates(pages);
    if (candidates.length > 0) {
      return candidates.map((candidate, index) => ({
        id: `inferred-${index}`,
        parentId: null,
        title: candidate.title,
        level: Math.max(1, candidate.level),
        startPage: candidate.pageNumber,
        endPage: null,
        orderIndex: index,
        pathTitles: [candidate.title],
        source: "inferred",
        children: [],
      }));
    }

    const synthetic: PdfSectionDraft[] = [];
    const pageWindow = 5;
    for (let start = 1, index = 0; start <= pages.length; start += pageWindow, index += 1) {
      const end = Math.min(pages.length, start + pageWindow - 1);
      const title = `第 ${index + 1} 部分（第 ${start}-${end} 页）`;
      synthetic.push({
        id: `synthetic-${index}`,
        parentId: null,
        title,
        level: 1,
        startPage: start,
        endPage: end,
        orderIndex: index,
        pathTitles: [title],
        source: "synthetic",
        children: [],
      });
    }
    return synthetic;
  }

  private collectHeadingCandidates(pages: PdfPageExtraction[]): PdfHeadingCandidate[] {
    const results: PdfHeadingCandidate[] = [];
    let previousTitle = "";
    pages.forEach(page => {
      const lines = page.content
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 8);
      const candidate = lines
        .map(line => this.scoreHeadingCandidate(line, page.pageNumber))
        .filter((item): item is PdfHeadingCandidate => item !== null)
        .sort((a, b) => b.score - a.score)[0];
      if (!candidate) {
        return;
      }
      if (candidate.title === previousTitle) {
        return;
      }
      previousTitle = candidate.title;
      results.push(candidate);
    });
    return results;
  }

  private scoreHeadingCandidate(line: string, pageNumber: number): PdfHeadingCandidate | null {
    const title = line.replace(/\s+/g, " ").trim();
    if (!title || title.length > 80) {
      return null;
    }
    const numberedPattern =
      /^((\d+(\.\d+){0,3})|第[一二三四五六七八九十百千万0-9]+[章节部分篇]|chapter\s+\d+|section\s+\d+)/i;
    const cleanSentence = !/[。！？!?]{1,}/.test(title);
    const shortEnough = title.length <= 40;
    let score = 0;
    if (numberedPattern.test(title)) {
      score += 4;
    }
    if (shortEnough) {
      score += 2;
    }
    if (cleanSentence) {
      score += 1;
    }
    if (/^[A-Z0-9\s\-:]+$/.test(title) && /[A-Z]/.test(title)) {
      score += 1;
    }
    if (score < 4) {
      return null;
    }
    return {
      title,
      pageNumber,
      level: this.guessHeadingLevel(title),
      score,
    };
  }

  private guessHeadingLevel(title: string): number {
    const decimal = title.match(/^(\d+(?:\.\d+){0,3})/);
    if (decimal) {
      return decimal[1].split(".").length;
    }
    if (/第[一二三四五六七八九十百千万0-9]+章/.test(title)) {
      return 1;
    }
    if (/第[一二三四五六七八九十百千万0-9]+节/.test(title)) {
      return 2;
    }
    if (/第[一二三四五六七八九十百千万0-9]+部分/.test(title)) {
      return 1;
    }
    return 1;
  }

  private normalizeSectionTree(sections: PdfSectionDraft[], pageCount: number): PdfSectionDraft[] {
    const normalized = sections.map(section => ({
      ...section,
      children: this.normalizeSectionTree(section.children, pageCount),
    }));
    const flat = this.flattenDraftSections(normalized);

    let lastKnownStart = 1;
    for (let index = flat.length - 1; index >= 0; index -= 1) {
      const current = flat[index];
      if (current.startPage == null) {
        const childStart = current.children.find(item => item.startPage != null)?.startPage;
        current.startPage = childStart ?? lastKnownStart;
      }
      if (current.startPage != null) {
        lastKnownStart = current.startPage;
      }
    }

    let forwardStart = 1;
    flat.forEach(section => {
      section.startPage = Math.max(1, Math.min(pageCount, section.startPage ?? forwardStart));
      forwardStart = section.startPage;
    });

    flat.forEach((section, index) => {
      if (section.endPage != null) {
        section.endPage = Math.max(section.startPage || 1, Math.min(pageCount, section.endPage));
        return;
      }
      const next = flat.slice(index + 1).find(candidate => candidate.level <= section.level);
      const computedEnd = next ? (next.startPage || pageCount) - 1 : pageCount;
      section.endPage = Math.max(section.startPage || 1, Math.min(pageCount, computedEnd));
    });

    return normalized;
  }

  private flattenDraftSections(sections: PdfSectionDraft[]): PdfSectionDraft[] {
    const result: PdfSectionDraft[] = [];
    sections.forEach(section => {
      result.push(section);
      result.push(...this.flattenDraftSections(section.children));
    });
    return result;
  }

  private flattenSectionTree(sections: PdfSectionDraft[]): PdfSectionRecord[] {
    const result: PdfSectionRecord[] = [];
    sections.forEach(section => {
      result.push({
        id: section.id,
        parentId: section.parentId,
        title: section.title,
        level: section.level,
        startPage: section.startPage || 1,
        endPage: section.endPage || section.startPage || 1,
        orderIndex: section.orderIndex,
        pathTitles: section.pathTitles,
        source: section.source,
      });
      result.push(...this.flattenSectionTree(section.children));
    });
    return result;
  }

  private chunkPages(pages: PdfPageExtraction[]): PdfIndexChunkRecord[] {
    const chunks: PdfIndexChunkRecord[] = [];

    pages.forEach(page => {
      if (!page.content.trim()) {
        return;
      }
      const rawParagraphs = page.content
        .split(/\n{2,}/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean);

      const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [page.content.trim()];
      let pendingTexts: string[] = [];
      let pendingStart = 0;
      let pendingEnd = 0;
      let chunkIndex = 0;
      let cursor = 0;

      const flush = () => {
        if (pendingTexts.length === 0) {
          return;
        }
        const content = pendingTexts.join("\n\n").trim();
        if (!content) {
          pendingTexts = [];
          return;
        }
        chunks.push({
          pageNumber: page.pageNumber,
          chunkIndex,
          content,
          charStart: pendingStart,
          charEnd: pendingEnd,
        });
        chunkIndex += 1;
        pendingTexts = [];
      };

      paragraphs.forEach(paragraph => {
        const start = Math.max(cursor, page.content.indexOf(paragraph, cursor));
        const safeStart = start >= 0 ? start : cursor;
        const end = safeStart + paragraph.length;
        cursor = end;

        if (paragraph.length > DEFAULT_CHUNK_MAX) {
          flush();
          for (let offset = 0; offset < paragraph.length; offset += DEFAULT_CHUNK_MAX) {
            const piece = paragraph.slice(offset, offset + DEFAULT_CHUNK_MAX).trim();
            if (!piece) {
              continue;
            }
            chunks.push({
              pageNumber: page.pageNumber,
              chunkIndex,
              content: piece,
              charStart: safeStart + offset,
              charEnd: safeStart + offset + piece.length,
            });
            chunkIndex += 1;
          }
          return;
        }

        const nextLength = pendingTexts.join("\n\n").length + paragraph.length;
        if (pendingTexts.length > 0 && nextLength > DEFAULT_CHUNK_MAX) {
          flush();
        }

        if (pendingTexts.length === 0) {
          pendingStart = safeStart;
        }
        pendingTexts.push(paragraph);
        pendingEnd = end;

        if (pendingTexts.join("\n\n").length >= DEFAULT_CHUNK_MIN) {
          flush();
        }
      });

      flush();
    });

    return chunks;
  }

  async searchContent(params: SearchPdfParams): Promise<PdfSearchResult[]> {
    if (!params.query.trim()) {
      log.warn("[PdfSearch] skipped empty query");
      return [];
    }

    const indexStatus = this.getIndexStatus(params.mainDbName, params.pdfId);
    log.info(
      `[PdfSearch] start: pdfId=${params.pdfId}, mainDb=${params.mainDbName}, query=${JSON.stringify(
        params.query
      )}, limit=${Math.max(1, params.limit || 5)}, indexState=${indexStatus.state}, pageCount=${indexStatus.pageCount}`
    );
    if (indexStatus.state === "failed") {
      log.warn(
        `[PdfSearch] aborted: pdfId=${params.pdfId}, reason=index_failed, error=${indexStatus.error || ""}`
      );
      return [];
    }

    const embeddingConfig = await this.getEmbeddingConfig();
    const currentEmbeddingFingerprint = pdfIndexDBManager.getEmbeddingFingerprint(
      params.mainDbName,
      params.pdfId
    );
    const currentVecDimensions = pdfIndexDBManager.getVectorDimensions(
      params.mainDbName,
      params.pdfId
    );
    const vectorAvailable =
      Boolean(embeddingConfig) &&
      currentEmbeddingFingerprint === (embeddingConfig?.fingerprint || null) &&
      (!currentVecDimensions || currentVecDimensions === embeddingConfig?.dimensions);
    log.info(
      `[PdfSearch] capabilities: pdfId=${params.pdfId}, vectorAvailable=${vectorAvailable}, currentVecDimensions=${currentVecDimensions || 0}`
    );

    const { results } = await runSearchPipeline({
      query: params.query,
      limit: Math.max(1, params.limit || 5),
      context: {
        pdfId: params.pdfId,
        mainDbName: params.mainDbName,
        vector:
          vectorAvailable && embeddingConfig
            ? {
                distance: embeddingConfig.distance,
                embedQuery: async (queryText: string) => {
                  const embeddings = await this.embedTexts(
                    [queryText],
                    embeddingConfig,
                    undefined,
                    true
                  );
                  return embeddings[0] || null;
                },
              }
            : null,
      },
      adapter: createPdfSearchAdapter(),
      logger: pipelineLog => {
        log.info("[SearchCore][pdf]", pipelineLog);
      },
      stageLogger: stageLog => {
        log.info(`[SearchCore][pdf][${stageLog.stage}]`, stageLog);
      },
    });

    if (results.length === 0) {
      log.warn(
        `[PdfSearch] empty_result: pdfId=${params.pdfId}, query=${JSON.stringify(
          params.query
        )}, indexState=${indexStatus.state}, pageCount=${indexStatus.pageCount}`
      );
    } else {
      log.info(
        `[PdfSearch] done: pdfId=${params.pdfId}, resultCount=${results.length}, firstPage=${results[0]?.pageNumber ?? 0}`
      );
    }

    return results;
  }

  private getPdfRecord(mainDbName: string, pdfId: number) {
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      throw new Error(`数据库未连接: ${mainDbName}`);
    }
    return PdfTable.getPdfById(db, pdfId);
  }

  getDocumentMap(mainDbName: string, pdfId: number, depth?: number): PdfDocumentMap {
    const pdf = this.getPdfRecord(mainDbName, pdfId);
    return pdfIndexDBManager.getDocumentMap(mainDbName, pdfId, {
      fileName: pdf.fileName,
      depth,
    });
  }

  async getDocumentInfo(mainDbName: string, pdfId: number): Promise<PdfDocumentInfo> {
    const pdf = this.getPdfRecord(mainDbName, pdfId);
    const indexStatus = this.getIndexStatus(mainDbName, pdfId);
    return {
      pdfId,
      fileName: pdf.fileName,
      pageCount: indexStatus.pageCount,
      indexStatus,
    };
  }
}

export default new PdfIndexQueue();
