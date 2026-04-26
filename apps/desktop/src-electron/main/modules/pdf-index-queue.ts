import { ipcMain, app } from "electron";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
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
  PdfReadingPath,
  PdfSectionSummary,
} from "@/types";
import type { EmbeddingProviderType } from "@/types/embedding";
import databaseModule from "./database";
import userSettingModule from "./user-setting";
import pdfIndexDBManager, {
  type PdfDocumentSummaryRecord,
  type PdfIndexChunkRecord,
  type PdfSectionRecord,
  type PdfSectionSummaryRecord,
} from "./pdf-index-db";
import PdfTable from "./tables/pdf";
import pythonService from "./python-service";
import { runSearchPipeline } from "./search-core/pipeline";
import { createPdfSearchAdapter } from "./search-core/pdf-search-adapter";
import { NoopExpander } from "./search-core/expander";
import { NoopReranker } from "./search-core/reranker";
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

interface ProviderConfig {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{
    name: string;
  }>;
}

interface LLMUsageConfig {
  providerId: string;
  modelName: string;
}

interface SettingWithLLMConfigs {
  llmUsageSettings?: {
    vibeLearningDocSummary?: LLMUsageConfig | null;
  };
  llmConfigs?: ProviderConfig[];
}

interface ResolvedPdfSummaryLLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
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
    Pick<
      PdfIndexStatus,
      "currentStage" | "progressCurrent" | "progressTotal" | "progressLabel"
    >
  >();

  async init() {
    this.activeMainDbName = databaseModule.getCurrentDatabaseName();

    ipcMain.handle(
      "pdf-index:ensure",
      async (_event, params: EnsurePdfIndexParams) => {
        return this.ensureIndexed(params);
      },
    );
    ipcMain.handle(
      "pdf-index:rebuild",
      async (_event, params: EnsurePdfIndexParams) => {
        return this.ensureIndexed({ ...params, force: true });
      },
    );
    ipcMain.handle(
      "pdf-index:status",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        this.getIndexStatus(params.mainDbName, params.pdfId),
    );
    ipcMain.handle(
      "pdf-index:search",
      async (_event, params: SearchPdfParams) => {
        return this.searchContent(params);
      },
    );
    ipcMain.handle(
      "pdf-index:document-info",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        this.getDocumentInfo(params.mainDbName, params.pdfId),
    );
    ipcMain.handle(
      "pdf-index:page-content",
      async (
        _event,
        params: { pdfId: number; mainDbName: string; pageNumber: number },
      ) =>
        pdfIndexDBManager.getPageContent(
          params.mainDbName,
          params.pdfId,
          params.pageNumber,
        ),
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
        },
      ) =>
        pdfIndexDBManager.getPageRangeContent(
          params.mainDbName,
          params.pdfId,
          params.startPage,
          params.endPage,
        ),
    );
    ipcMain.handle(
      "pdf-index:outline",
      async (_event, params: { pdfId: number; mainDbName: string }) =>
        pdfIndexDBManager.getOutline(params.mainDbName, params.pdfId),
    );
    ipcMain.handle(
      "pdf-index:document-map",
      async (
        _event,
        params: { pdfId: number; mainDbName: string; depth?: number },
      ) => this.getDocumentMap(params.mainDbName, params.pdfId, params.depth),
    );
    ipcMain.handle(
      "pdf-index:section-summary",
      async (
        _event,
        params: { pdfId: number; mainDbName: string; sectionId: string },
      ) =>
        pdfIndexDBManager.getSectionSummary(
          params.mainDbName,
          params.pdfId,
          params.sectionId,
        ),
    );
    ipcMain.handle(
      "pdf-index:section-search",
      async (
        _event,
        params: {
          pdfId: number;
          mainDbName: string;
          query: string;
          limit?: number;
        },
      ) => this.searchSections(params),
    );
    ipcMain.handle(
      "pdf-index:section-detail",
      async (
        _event,
        params: { pdfId: number; mainDbName: string; sectionId: string },
      ) =>
        pdfIndexDBManager.getSectionDetail(
          params.mainDbName,
          params.pdfId,
          params.sectionId,
        ),
    );

    databaseModule.onDatabaseChange((dbName) => {
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
    >,
  ) {
    this.progressByTaskKey.set(taskKey, progress);
  }

  async ensureIndex(params: EnsurePdfIndexParams): Promise<PdfIndexStatus> {
    return this.ensureIndexed(params);
  }

  private async ensureIndexed(
    params: EnsurePdfIndexParams,
  ): Promise<PdfIndexStatus> {
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

  private async runEnsureIndexed(
    params: EnsurePdfIndexParams,
  ): Promise<PdfIndexStatus> {
    const { pdfId, resolvedPath, mainDbName, force = false } = params;
    const taskKey = this.buildTaskKey(params);
    const stat = await fs.stat(resolvedPath);
    const fingerprint = `${resolvedPath}:${stat.size}:${Math.floor(stat.mtimeMs)}`;
    const currentStatus = pdfIndexDBManager.getIndexStatus(mainDbName, pdfId);
    const embeddingConfig = await this.getEmbeddingConfig();
    const currentEmbeddingFingerprint =
      pdfIndexDBManager.getEmbeddingFingerprint(mainDbName, pdfId);

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
      const extracted = await this.extractPdf(resolvedPath, (progress) => {
        this.updateProgress(taskKey, progress);
      });
      this.updateProgress(taskKey, {
        currentStage: "structuring",
        progressCurrent: 0,
        progressTotal: extracted.pageCount,
        progressLabel: "构建章节结构",
      });
      const sections = this.buildSections(extracted.outline, extracted.pages);
      this.updateProgress(taskKey, {
        currentStage: "summarizing",
        progressCurrent: 0,
        progressTotal: Math.max(1, sections.length),
        progressLabel: "生成章节摘要",
      });
      const summaryLLMConfig = await this.getSummaryLLMConfig();
      const { sectionSummaries, documentSummary, sectionEmbeddingTexts } =
        await this.buildSummaries(
          sections,
          extracted.pages,
          summaryLLMConfig,
          (current, total, label) => {
            this.updateProgress(taskKey, {
              currentStage: "summarizing",
              progressCurrent: current,
              progressTotal: total,
              progressLabel: label,
            });
          },
        );
      const chunks = this.chunkPages(extracted.pages);
      this.updateProgress(taskKey, {
        currentStage: "embedding",
        progressCurrent: 0,
        progressTotal: chunks.length + sectionEmbeddingTexts.length,
        progressLabel:
          chunks.length + sectionEmbeddingTexts.length > 0
            ? "开始生成向量"
            : "无需生成向量",
      });
      let embeddings: number[][] | undefined;
      let sectionEmbeddings: number[][] | undefined;
      if (embeddingConfig) {
        const totalEmbeddingItems =
          chunks.length + sectionEmbeddingTexts.length;
        let completedEmbeddingItems = 0;
        if (chunks.length > 0) {
          embeddings = await this.embedTexts(
            chunks.map((chunk) => chunk.content),
            embeddingConfig,
            (current) => {
              completedEmbeddingItems = current;
              this.updateProgress(taskKey, {
                currentStage: "embedding",
                progressCurrent: completedEmbeddingItems,
                progressTotal: totalEmbeddingItems,
                progressLabel: `生成向量 ${completedEmbeddingItems}/${totalEmbeddingItems}`,
              });
            },
          );
        }
        if (sectionEmbeddingTexts.length > 0) {
          sectionEmbeddings = await this.embedTexts(
            sectionEmbeddingTexts,
            embeddingConfig,
            (current) => {
              completedEmbeddingItems = chunks.length + current;
              this.updateProgress(taskKey, {
                currentStage: "embedding",
                progressCurrent: completedEmbeddingItems,
                progressTotal: totalEmbeddingItems,
                progressLabel: `生成向量 ${completedEmbeddingItems}/${totalEmbeddingItems}`,
              });
            },
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
        pages: extracted.pages.map((page) => ({
          pdfId,
          pageNumber: page.pageNumber,
          content: page.content,
          charCount: page.charCount,
        })),
        chunks,
        outline: extracted.outline,
        sections,
        sectionSummaries,
        documentSummary,
        embeddings,
        sectionEmbeddings,
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

  private async getSummaryLLMConfig(): Promise<ResolvedPdfSummaryLLMConfig | null> {
    const setting =
      (await userSettingModule.getSettingSnapshot()) as SettingWithLLMConfigs;
    const usage = setting.llmUsageSettings?.vibeLearningDocSummary;
    if (!usage?.providerId || !usage.modelName || !setting.llmConfigs?.length) {
      return null;
    }

    const provider = setting.llmConfigs.find(
      (item) => item.id === usage.providerId,
    );
    if (!provider?.apiKey?.trim() || !provider.baseUrl?.trim()) {
      return null;
    }

    const modelExists = provider.models?.some(
      (item) => item.name === usage.modelName,
    );
    if (provider.models?.length && !modelExists) {
      return null;
    }

    return {
      apiKey: provider.apiKey.trim(),
      baseUrl: provider.baseUrl.trim(),
      model: usage.modelName,
    };
  }

  private async embedTexts(
    texts: string[],
    embeddingConfig: ResolvedPdfEmbeddingConfig,
    onProgress?: (current: number, total: number) => void,
  ): Promise<number[][]> {
    if (embeddingConfig.providerType === "local_python") {
      const resolvedModelDir =
        embeddingConfig.localModelDir ||
        path.join(app.getPath("userData"), "embedding-models");
      const client = await pythonService.ensureStarted();
      const result = await client.request<{
        embeddings: number[][];
      }>("embed_texts", {
        texts,
        modelDir: resolvedModelDir,
        modelName: embeddingConfig.model,
        batchSize: embeddingConfig.batchSize || 8,
        devicePolicy: embeddingConfig.devicePolicy || "auto",
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
    return result.data.map((item) => item.embedding);
  }

  private async extractPdf(
    resolvedPath: string,
    onProgress?: (
      progress: Pick<
        PdfIndexStatus,
        "currentStage" | "progressCurrent" | "progressTotal" | "progressLabel"
      >,
    ) => void,
  ): Promise<ExtractPdfResult> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const require = createRequire(import.meta.url);
    const workerPath =
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
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
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const content = this.normalizePageText(
          textContent.items as Array<{ str?: string; hasEOL?: boolean }>,
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

      const rawOutline = ((await document.getOutline()) ||
        []) as PdfOutlineItemInput[];
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

  private normalizePageText(
    items: Array<{ str?: string; hasEOL?: boolean }>,
  ): string {
    const parts: string[] = [];
    items.forEach((item) => {
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
    parentPath = "outline",
  ): Promise<PdfOutlineNode[]> {
    const result: PdfOutlineNode[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const id = `${parentPath}-${index}`;
      const pageNumber = await this.resolveOutlineDestination(
        document,
        item.dest,
      );
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

  private async resolveOutlineDestination(
    document: any,
    dest: unknown,
  ): Promise<number | null> {
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

  private buildSections(
    outline: PdfOutlineNode[],
    pages: PdfPageExtraction[],
  ): PdfSectionRecord[] {
    const pageCount = pages.length;
    const outlined = this.buildSectionsFromOutline(outline, pageCount);
    const sectionTree =
      outlined.length > 0 ? outlined : this.inferSectionsFromPages(pages);
    const normalized = this.normalizeSectionTree(sectionTree, pageCount);
    return this.flattenSectionTree(normalized);
  }

  private buildSectionsFromOutline(
    nodes: PdfOutlineNode[],
    pageCount: number,
    parentId: string | null = null,
    level = 1,
    parentPath: string[] = [],
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
      pathTitles: [
        ...parentPath,
        String(node.title || "未命名章节").trim() || "未命名章节",
      ],
      source: "outline",
      children: this.buildSectionsFromOutline(
        node.children || [],
        pageCount,
        node.id,
        level + 1,
        [
          ...parentPath,
          String(node.title || "未命名章节").trim() || "未命名章节",
        ],
      ),
    }));
  }

  private inferSectionsFromPages(
    pages: PdfPageExtraction[],
  ): PdfSectionDraft[] {
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
    for (
      let start = 1, index = 0;
      start <= pages.length;
      start += pageWindow, index += 1
    ) {
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

  private collectHeadingCandidates(
    pages: PdfPageExtraction[],
  ): PdfHeadingCandidate[] {
    const results: PdfHeadingCandidate[] = [];
    let previousTitle = "";
    pages.forEach((page) => {
      const lines = page.content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);
      const candidate = lines
        .map((line) => this.scoreHeadingCandidate(line, page.pageNumber))
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

  private scoreHeadingCandidate(
    line: string,
    pageNumber: number,
  ): PdfHeadingCandidate | null {
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

  private normalizeSectionTree(
    sections: PdfSectionDraft[],
    pageCount: number,
  ): PdfSectionDraft[] {
    const normalized = sections.map((section) => ({
      ...section,
      children: this.normalizeSectionTree(section.children, pageCount),
    }));
    const flat = this.flattenDraftSections(normalized);

    let lastKnownStart = 1;
    for (let index = flat.length - 1; index >= 0; index -= 1) {
      const current = flat[index];
      if (current.startPage == null) {
        const childStart = current.children.find(
          (item) => item.startPage != null,
        )?.startPage;
        current.startPage = childStart ?? lastKnownStart;
      }
      if (current.startPage != null) {
        lastKnownStart = current.startPage;
      }
    }

    let forwardStart = 1;
    flat.forEach((section) => {
      section.startPage = Math.max(
        1,
        Math.min(pageCount, section.startPage ?? forwardStart),
      );
      forwardStart = section.startPage;
    });

    flat.forEach((section, index) => {
      if (section.endPage != null) {
        section.endPage = Math.max(
          section.startPage || 1,
          Math.min(pageCount, section.endPage),
        );
        return;
      }
      const next = flat
        .slice(index + 1)
        .find((candidate) => candidate.level <= section.level);
      const computedEnd = next ? (next.startPage || pageCount) - 1 : pageCount;
      section.endPage = Math.max(
        section.startPage || 1,
        Math.min(pageCount, computedEnd),
      );
    });

    return normalized;
  }

  private flattenDraftSections(sections: PdfSectionDraft[]): PdfSectionDraft[] {
    const result: PdfSectionDraft[] = [];
    sections.forEach((section) => {
      result.push(section);
      result.push(...this.flattenDraftSections(section.children));
    });
    return result;
  }

  private flattenSectionTree(sections: PdfSectionDraft[]): PdfSectionRecord[] {
    const result: PdfSectionRecord[] = [];
    sections.forEach((section) => {
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

  private async buildSummaries(
    sections: PdfSectionRecord[],
    pages: PdfPageExtraction[],
    llmConfig: ResolvedPdfSummaryLLMConfig | null,
    onProgress?: (current: number, total: number, label: string) => void,
  ): Promise<{
    sectionSummaries: PdfSectionSummaryRecord[];
    documentSummary: PdfDocumentSummaryRecord;
    sectionEmbeddingTexts: string[];
  }> {
    const pageMap = new Map(
      pages.map((page) => [page.pageNumber, page.content]),
    );
    const sectionContents = sections.map((section) =>
      this.collectSectionContent(section.startPage, section.endPage, pageMap),
    );
    const baselineSectionSummaries = sections.map((section, index) =>
      this.buildSectionSummary(section, sectionContents[index]),
    );
    const sectionSummaries = llmConfig
      ? await this.enhanceSectionSummariesWithLLM(
          sections,
          sectionContents,
          baselineSectionSummaries,
          llmConfig,
          onProgress,
        )
      : baselineSectionSummaries;
    const baselineDocumentSummary = this.buildDocumentSummary(
      sections,
      sectionSummaries,
    );
    const documentSummary = llmConfig
      ? await this.enhanceDocumentSummaryWithLLM(
          sections,
          sectionSummaries,
          baselineDocumentSummary,
          llmConfig,
          onProgress,
        )
      : baselineDocumentSummary;
    const sectionEmbeddingTexts = sections.map((section, index) =>
      this.buildSectionEmbeddingText(section, sectionSummaries[index]),
    );
    return {
      sectionSummaries,
      documentSummary,
      sectionEmbeddingTexts,
    };
  }

  private async enhanceSectionSummariesWithLLM(
    sections: PdfSectionRecord[],
    sectionContents: string[],
    baselineSummaries: PdfSectionSummaryRecord[],
    llmConfig: ResolvedPdfSummaryLLMConfig,
    onProgress?: (current: number, total: number, label: string) => void,
  ): Promise<PdfSectionSummaryRecord[]> {
    const results: PdfSectionSummaryRecord[] = [];
    const total = sections.length + 1;

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      const baseline = baselineSummaries[index];
      onProgress?.(
        index,
        total,
        `生成章节 LLM 摘要 ${index}/${sections.length}`,
      );
      try {
        const llmSummary = await this.summarizeSectionWithLLM(
          section,
          sectionContents[index],
          baseline,
          llmConfig,
        );
        results.push(
          llmSummary
            ? {
                ...baseline,
                ...llmSummary,
                summarySource: "llm",
                status: "ready",
              }
            : baseline,
        );
      } catch (error) {
        log.warn(
          `[PdfIndexQueue] LLM section summary failed: section=${section.id}, error=${error}`,
        );
        results.push({
          ...baseline,
          status: "degraded",
        });
      }
    }

    onProgress?.(
      sections.length,
      total,
      `生成章节 LLM 摘要 ${sections.length}/${sections.length}`,
    );
    return results;
  }

  private async enhanceDocumentSummaryWithLLM(
    sections: PdfSectionRecord[],
    sectionSummaries: PdfSectionSummaryRecord[],
    baselineSummary: PdfDocumentSummaryRecord,
    llmConfig: ResolvedPdfSummaryLLMConfig,
    onProgress?: (current: number, total: number, label: string) => void,
  ): Promise<PdfDocumentSummaryRecord> {
    const total = sections.length + 1;
    onProgress?.(sections.length, total, "生成文档总纲 LLM 摘要");
    try {
      const llmSummary = await this.summarizeDocumentWithLLM(
        sections,
        sectionSummaries,
        baselineSummary,
        llmConfig,
      );
      if (!llmSummary) {
        return baselineSummary;
      }
      return {
        ...baselineSummary,
        ...llmSummary,
        summarySource: "llm",
        status: "ready",
      };
    } catch (error) {
      log.warn(`[PdfIndexQueue] LLM document summary failed: ${error}`);
      return {
        ...baselineSummary,
        status: "degraded",
      };
    }
  }

  private collectSectionContent(
    startPage: number,
    endPage: number,
    pageMap: Map<number, string>,
  ): string {
    const parts: string[] = [];
    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      const pageText = pageMap.get(pageNumber);
      if (pageText?.trim()) {
        parts.push(pageText.trim());
      }
    }
    return parts.join("\n\n").trim();
  }

  private buildSectionSummary(
    section: PdfSectionRecord,
    content: string,
  ): PdfSectionSummaryRecord {
    const sentences = this.splitIntoSentences(content);
    const terms = this.extractKeywords(content, 12);
    const mainPoints = this.pickScoredSentences(sentences, terms, 8);
    const argumentsList = this.pickPatternSentences(
      sentences,
      /提出|认为|主张|说明|指出|讨论|分析|介绍|证明|表明|发现|旨在|尝试|本文|本章/,
      5,
      mainPoints,
    );
    const evidence = this.pickPatternSentences(
      sentences,
      /例如|比如|案例|数据|实验|结果|图表|统计|调查|显示|证据|观察|样本/,
      6,
      mainPoints,
    );
    const conclusions = this.pickPatternSentences(
      sentences,
      /因此|综上|总之|结论|说明|意味着|可见|最后|由此/,
      3,
      mainPoints.slice().reverse(),
    );
    const questions = this.pickPatternSentences(
      sentences,
      /问题|挑战|限制|未来|尚未|仍需|如何|为何|\?/,
      5,
      mainPoints,
    );
    const overview = this.composeOverview(
      section.title,
      mainPoints,
      argumentsList,
      conclusions,
    );

    return {
      sectionId: section.id,
      overview,
      mainPoints,
      arguments: argumentsList,
      evidence,
      conclusions,
      terms,
      questions,
      summarySource: "extractive",
      status: "ready",
    };
  }

  private buildDocumentSummary(
    sections: PdfSectionRecord[],
    sectionSummaries: PdfSectionSummaryRecord[],
  ): PdfDocumentSummaryRecord {
    const topLevelSections = sections.filter((section) => section.level === 1);
    const overview = this.trimText(
      sectionSummaries
        .filter((summary) =>
          topLevelSections.some((section) => section.id === summary.sectionId),
        )
        .map((summary) => summary.overview)
        .filter(Boolean)
        .join("\n"),
      800,
    );
    const themes = this.uniqueTop(
      sectionSummaries.flatMap((summary) => summary.terms),
      6,
    );
    const mainArguments = this.uniqueTop(
      sectionSummaries.flatMap((summary) => summary.arguments),
      8,
    );
    const coreEvidence = this.uniqueTop(
      sectionSummaries.flatMap((summary) => summary.evidence),
      8,
    );
    const conclusion = this.uniqueTop(
      [
        ...sectionSummaries.slice(-2).flatMap((summary) => summary.conclusions),
        ...sectionSummaries.flatMap((summary) => summary.conclusions),
      ],
      4,
    );
    const chapterMap = topLevelSections.map((section, index) => ({
      sectionId: section.id,
      title: section.title,
      role: this.classifySectionRole(
        section.title,
        index,
        topLevelSections.length,
      ),
      startPage: section.startPage,
      endPage: section.endPage,
    }));
    const readingPaths = this.buildReadingPaths(chapterMap);

    return {
      overview,
      themes,
      chapterMap,
      mainArguments,
      coreEvidence,
      conclusion,
      readingPaths,
      summarySource: "extractive",
      status: "ready",
    };
  }

  private async summarizeSectionWithLLM(
    section: PdfSectionRecord,
    content: string,
    baseline: PdfSectionSummaryRecord,
    llmConfig: ResolvedPdfSummaryLLMConfig,
  ): Promise<Partial<PdfSectionSummaryRecord> | null> {
    const excerpt = this.limitTextForLLM(content, 12_000);
    if (!excerpt) {
      return null;
    }

    const response = await this.runJsonChatCompletion(llmConfig, [
      {
        role: "system",
        content:
          "你是一个严谨的 PDF 章节摘要助手。你必须只根据给定章节内容输出 JSON，不要输出 Markdown，不要补充解释。",
      },
      {
        role: "user",
        content: `请为下面的 PDF 章节生成结构化摘要，严格返回 JSON 对象，字段必须完整：
{
  "overview": "150-300字概述",
  "mainPoints": ["5-8条要点"],
  "arguments": ["2-5条核心论点"],
  "evidence": ["2-6条支撑证据/例子/数据"],
  "conclusions": ["1-3条结论"],
  "terms": ["5-12个关键词"],
  "questions": ["1-5个遗留问题/争议点/后续阅读入口"]
}

约束：
1. 必须使用中文。
2. 不能编造原文没有的信息。
3. 如果某字段信息不足，返回空数组或保守概述。
4. 优先比 baseline 更完整，但不要丢失关键信息。

章节标题：${section.title}
页范围：${section.startPage}-${section.endPage}

baseline:
${JSON.stringify(baseline, null, 2)}

章节内容：
${excerpt}`,
      },
    ]);

    return this.normalizeSectionSummaryFromLLM(response, baseline);
  }

  private async summarizeDocumentWithLLM(
    sections: PdfSectionRecord[],
    sectionSummaries: PdfSectionSummaryRecord[],
    baseline: PdfDocumentSummaryRecord,
    llmConfig: ResolvedPdfSummaryLLMConfig,
  ): Promise<Partial<PdfDocumentSummaryRecord> | null> {
    const compactSections = sections.map((section, index) => ({
      sectionId: section.id,
      title: section.title,
      level: section.level,
      startPage: section.startPage,
      endPage: section.endPage,
      summary: sectionSummaries[index],
    }));

    const response = await this.runJsonChatCompletion(llmConfig, [
      {
        role: "system",
        content:
          "你是一个严谨的 PDF 文档总纲助手。你必须根据给定章节摘要输出 JSON，不要输出 Markdown，不要补充解释。",
      },
      {
        role: "user",
        content: `请根据下面的章节摘要生成整篇 PDF 的总纲地图，严格返回 JSON 对象，字段必须完整：
{
  "overview": "300-800字总述",
  "themes": ["3-6条主题主线"],
  "chapterMap": [
    {
      "sectionId": "章节ID",
      "title": "章节标题",
      "role": "该章在全文中的作用，如背景/方法/论证/案例/结论",
      "startPage": 1,
      "endPage": 5
    }
  ],
  "mainArguments": ["3-8条全文核心论点"],
  "coreEvidence": ["3-8条跨章节关键证据"],
  "conclusion": ["1-4条全文结论/作者立场"],
  "readingPaths": [
    {
      "id": "路径ID",
      "label": "路径名称",
      "description": "该阅读路径说明",
      "sectionIds": ["章节ID1", "章节ID2"]
    }
  ]
}

约束：
1. 必须使用中文。
2. 不能编造原文没有的信息。
3. chapterMap 必须覆盖主要顶层章节。
4. readingPaths 要能指导用户按问题类型阅读。

baseline:
${JSON.stringify(baseline, null, 2)}

章节摘要：
${JSON.stringify(compactSections, null, 2)}`,
      },
    ]);

    return this.normalizeDocumentSummaryFromLLM(response, baseline);
  }

  private async runJsonChatCompletion(
    llmConfig: ResolvedPdfSummaryLLMConfig,
    messages: Array<{ role: "system" | "user"; content: string }>,
  ): Promise<unknown> {
    const client = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseUrl,
    });

    const result = await client.chat.completions.create({
      model: llmConfig.model,
      temperature: 0.2,
      top_p: 1,
      stream: false,
      messages,
    });

    const content = result.choices[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("LLM 返回空内容");
    }

    return this.parseJsonLikeResponse(content);
  }

  private parseJsonLikeResponse(content: string): unknown {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced?.[1]?.trim() || trimmed;
    const startIndex = raw.indexOf("{");
    const endIndex = raw.lastIndexOf("}");
    const jsonText =
      startIndex >= 0 && endIndex > startIndex
        ? raw.slice(startIndex, endIndex + 1)
        : raw;
    return JSON.parse(jsonText);
  }

  private normalizeSectionSummaryFromLLM(
    value: unknown,
    baseline: PdfSectionSummaryRecord,
  ): Partial<PdfSectionSummaryRecord> | null {
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    return {
      overview: this.pickString(record.overview) || baseline.overview,
      mainPoints: this.pickStringArray(
        record.mainPoints,
        baseline.mainPoints,
        8,
      ),
      arguments: this.pickStringArray(record.arguments, baseline.arguments, 5),
      evidence: this.pickStringArray(record.evidence, baseline.evidence, 6),
      conclusions: this.pickStringArray(
        record.conclusions,
        baseline.conclusions,
        3,
      ),
      terms: this.pickStringArray(record.terms, baseline.terms, 12),
      questions: this.pickStringArray(record.questions, baseline.questions, 5),
    };
  }

  private normalizeDocumentSummaryFromLLM(
    value: unknown,
    baseline: PdfDocumentSummaryRecord,
  ): Partial<PdfDocumentSummaryRecord> | null {
    if (!value || typeof value !== "object") {
      return null;
    }
    const record = value as Record<string, unknown>;
    return {
      overview: this.pickString(record.overview) || baseline.overview,
      themes: this.pickStringArray(record.themes, baseline.themes, 6),
      chapterMap: this.pickChapterMap(record.chapterMap, baseline.chapterMap),
      mainArguments: this.pickStringArray(
        record.mainArguments,
        baseline.mainArguments,
        8,
      ),
      coreEvidence: this.pickStringArray(
        record.coreEvidence,
        baseline.coreEvidence,
        8,
      ),
      conclusion: this.pickStringArray(
        record.conclusion,
        baseline.conclusion,
        4,
      ),
      readingPaths: this.pickReadingPaths(
        record.readingPaths,
        baseline.readingPaths,
      ),
    };
  }

  private buildReadingPaths(
    chapterMap: PdfDocumentSummaryRecord["chapterMap"],
  ): PdfReadingPath[] {
    const intro = chapterMap.filter(
      (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
        /引言|背景|概述|绪论|前言/.test(item.role),
    );
    const method = chapterMap.filter(
      (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
        /方法|框架|分析/.test(item.role),
    );
    const conclusion = chapterMap.filter(
      (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
        /结论|总结|展望/.test(item.role),
    );
    const paths: PdfReadingPath[] = [];

    if (intro.length > 0) {
      paths.push({
        id: "background",
        label: "先看背景",
        description: "快速建立全文背景、问题定义与讨论范围。",
        sectionIds: intro.map(
          (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
            item.sectionId,
        ),
      });
    }
    if (method.length > 0) {
      paths.push({
        id: "analysis",
        label: "再看论证",
        description: "集中阅读方法、分析与关键论证章节。",
        sectionIds: method.map(
          (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
            item.sectionId,
        ),
      });
    }
    if (conclusion.length > 0) {
      paths.push({
        id: "conclusion",
        label: "最后看结论",
        description: "快速定位全文结论、总结与后续展开方向。",
        sectionIds: conclusion.map(
          (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
            item.sectionId,
        ),
      });
    }

    if (paths.length === 0 && chapterMap.length > 0) {
      paths.push({
        id: "overview",
        label: "顺序阅读",
        description: "按原始章节顺序阅读全文。",
        sectionIds: chapterMap.map(
          (item: PdfDocumentSummaryRecord["chapterMap"][number]) =>
            item.sectionId,
        ),
      });
    }

    return paths;
  }

  private classifySectionRole(
    title: string,
    index: number,
    total: number,
  ): string {
    if (/引言|背景|绪论|前言|概述/.test(title)) {
      return "引言背景";
    }
    if (/方法|模型|框架|设计|实现/.test(title)) {
      return "方法框架";
    }
    if (/实验|结果|分析|讨论|案例|实践/.test(title)) {
      return "分析论证";
    }
    if (/结论|总结|展望|后记/.test(title)) {
      return "结论总结";
    }
    if (index === 0) {
      return "引言背景";
    }
    if (index === total - 1) {
      return "结论总结";
    }
    return "分析论证";
  }

  private buildSectionEmbeddingText(
    section: PdfSectionRecord,
    summary: PdfSectionSummaryRecord,
  ): string {
    return [
      section.title,
      summary.overview,
      ...summary.mainPoints,
      ...summary.arguments,
      ...summary.evidence,
      ...summary.conclusions,
      ...summary.terms,
      ...summary.questions,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private splitIntoSentences(content: string): string[] {
    return content
      .replace(/\s+/g, " ")
      .split(/(?<=[。！？!?；;])/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 12);
  }

  private pickScoredSentences(
    sentences: string[],
    keywords: string[],
    limit: number,
  ): string[] {
    const scored = sentences.map((sentence, index) => {
      let score = Math.max(0, 30 - index);
      keywords.forEach((keyword) => {
        if (keyword && sentence.includes(keyword)) {
          score += 4;
        }
      });
      if (/提出|说明|分析|讨论|方法|结果|结论|发现/.test(sentence)) {
        score += 6;
      }
      if (sentence.length >= 20 && sentence.length <= 120) {
        score += 3;
      }
      return { sentence, score };
    });
    return this.uniqueTop(
      scored.sort((a, b) => b.score - a.score).map((item) => item.sentence),
      limit,
    );
  }

  private pickPatternSentences(
    sentences: string[],
    pattern: RegExp,
    limit: number,
    fallback: string[],
  ): string[] {
    const matched = this.uniqueTop(
      sentences.filter((sentence) => pattern.test(sentence)),
      limit,
    );
    if (matched.length > 0) {
      return matched;
    }
    return this.uniqueTop(fallback, limit);
  }

  private extractKeywords(content: string, limit: number): string[] {
    const tokens =
      content.match(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
    const stopwords = new Set([
      "我们",
      "你们",
      "他们",
      "本文",
      "本章",
      "一个",
      "一种",
      "可以",
      "进行",
      "以及",
      "如果",
      "因为",
      "所以",
      "这个",
      "那个",
      "通过",
      "研究",
      "问题",
      "内容",
      "章节",
    ]);
    const counts = new Map<string, number>();
    tokens.forEach((token) => {
      const normalized = token.trim();
      if (!normalized || stopwords.has(normalized)) {
        return;
      }
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([token]) => token);
  }

  private composeOverview(
    title: string,
    mainPoints: string[],
    argumentsList: string[],
    conclusions: string[],
  ): string {
    const parts = [
      ...mainPoints.slice(0, 3),
      ...argumentsList.slice(0, 2),
      ...conclusions.slice(0, 1),
    ];
    const overview = parts.join(" ").trim();
    if (!overview) {
      return `${title} 主要围绕该章节主题展开，当前索引已建立，可继续按章节下钻查看细节。`;
    }
    return this.trimText(overview, 320);
  }

  private limitTextForLLM(content: string, maxLength: number): string {
    const normalized = content.trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    const head = normalized.slice(0, Math.floor(maxLength * 0.75)).trim();
    const tail = normalized.slice(-Math.floor(maxLength * 0.2)).trim();
    return `${head}\n\n[...中间内容已省略以控制输入长度...]\n\n${tail}`;
  }

  private pickString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private pickStringArray(
    value: unknown,
    fallback: string[],
    limit: number,
  ): string[] {
    if (!Array.isArray(value)) {
      return this.uniqueTop(fallback, limit);
    }
    return this.uniqueTop(
      value.map((item) => this.pickString(item)).filter(Boolean),
      limit,
    );
  }

  private pickChapterMap(
    value: unknown,
    fallback: PdfDocumentSummaryRecord["chapterMap"],
  ): PdfDocumentSummaryRecord["chapterMap"] {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const result = value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const sectionId = this.pickString(record.sectionId);
        const title = this.pickString(record.title);
        const role = this.pickString(record.role);
        const startPage = Number(record.startPage);
        const endPage = Number(record.endPage);
        if (!sectionId || !title || !role) {
          return null;
        }
        return {
          sectionId,
          title,
          role,
          startPage: Number.isFinite(startPage) ? startPage : null,
          endPage: Number.isFinite(endPage) ? endPage : null,
        };
      })
      .filter((item): item is PdfDocumentSummaryRecord["chapterMap"][number] =>
        Boolean(item),
      );
    return result.length > 0 ? result : fallback;
  }

  private pickReadingPaths(
    value: unknown,
    fallback: PdfReadingPath[],
  ): PdfReadingPath[] {
    if (!Array.isArray(value)) {
      return fallback;
    }
    const result = value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const record = item as Record<string, unknown>;
        const id = this.pickString(record.id);
        const label = this.pickString(record.label);
        const description = this.pickString(record.description);
        const sectionIds = this.pickStringArray(record.sectionIds, [], 12);
        if (!id || !label || !description || sectionIds.length === 0) {
          return null;
        }
        return {
          id,
          label,
          description,
          sectionIds,
        };
      })
      .filter((item): item is PdfReadingPath => Boolean(item));
    return result.length > 0 ? result : fallback;
  }

  private trimText(content: string, limit: number): string {
    if (content.length <= limit) {
      return content;
    }
    return `${content.slice(0, Math.max(0, limit - 1)).trim()}…`;
  }

  private uniqueTop(items: string[], limit: number): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    items.forEach((item) => {
      const normalized = item.replace(/\s+/g, " ").trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      result.push(normalized);
    });
    return result.slice(0, limit);
  }

  private chunkPages(pages: PdfPageExtraction[]): PdfIndexChunkRecord[] {
    const chunks: PdfIndexChunkRecord[] = [];

    pages.forEach((page) => {
      if (!page.content.trim()) {
        return;
      }
      const rawParagraphs = page.content
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

      const paragraphs =
        rawParagraphs.length > 0 ? rawParagraphs : [page.content.trim()];
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

      paragraphs.forEach((paragraph) => {
        const start = Math.max(cursor, page.content.indexOf(paragraph, cursor));
        const safeStart = start >= 0 ? start : cursor;
        const end = safeStart + paragraph.length;
        cursor = end;

        if (paragraph.length > DEFAULT_CHUNK_MAX) {
          flush();
          for (
            let offset = 0;
            offset < paragraph.length;
            offset += DEFAULT_CHUNK_MAX
          ) {
            const piece = paragraph
              .slice(offset, offset + DEFAULT_CHUNK_MAX)
              .trim();
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
        params.query,
      )}, limit=${Math.max(1, params.limit || 5)}, indexState=${indexStatus.state}, pageCount=${indexStatus.pageCount}`,
    );
    if (indexStatus.state === "failed") {
      log.warn(
        `[PdfSearch] aborted: pdfId=${params.pdfId}, reason=index_failed, error=${indexStatus.error || ""}`,
      );
      return [];
    }

    const embeddingConfig = await this.getEmbeddingConfig();
    const currentEmbeddingFingerprint =
      pdfIndexDBManager.getEmbeddingFingerprint(
        params.mainDbName,
        params.pdfId,
      );
    const currentVecDimensions = pdfIndexDBManager.getVectorDimensions(
      params.mainDbName,
      params.pdfId,
    );
    const vectorAvailable =
      Boolean(embeddingConfig) &&
      currentEmbeddingFingerprint === (embeddingConfig?.fingerprint || null) &&
      (!currentVecDimensions ||
        currentVecDimensions === embeddingConfig?.dimensions);
    log.info(
      `[PdfSearch] capabilities: pdfId=${params.pdfId}, vectorAvailable=${vectorAvailable}, currentVecDimensions=${currentVecDimensions || 0}`,
    );
    const expander = new NoopExpander(
      "PDF 搜索默认禁用 query expansion 以避免超时",
    );
    const reranker = new NoopReranker("PDF 搜索默认禁用 reranker 以避免超时");

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
                  );
                  return embeddings[0] || null;
                },
              }
            : null,
      },
      adapter: createPdfSearchAdapter(),
      expander,
      reranker,
      logger: (pipelineLog) => {
        log.info("[SearchCore][pdf]", pipelineLog);
      },
      stageLogger: (stageLog) => {
        log.info(`[SearchCore][pdf][${stageLog.stage}]`, stageLog);
      },
    });

    if (results.length === 0) {
      log.warn(
        `[PdfSearch] empty_result: pdfId=${params.pdfId}, query=${JSON.stringify(
          params.query,
        )}, indexState=${indexStatus.state}, pageCount=${indexStatus.pageCount}`,
      );
    } else {
      log.info(
        `[PdfSearch] done: pdfId=${params.pdfId}, resultCount=${results.length}, firstPage=${results[0]?.pageNumber ?? 0}`,
      );
    }

    return results;
  }

  async searchSections(params: SearchPdfParams): Promise<PdfSectionSummary[]> {
    if (!params.query.trim()) {
      return [];
    }

    const limit = Math.max(1, params.limit || 5);
    const ftsResults = pdfIndexDBManager.searchSectionFTS(
      params.mainDbName,
      params.pdfId,
      params.query,
      limit,
    );
    const embeddingConfig = await this.getEmbeddingConfig();
    const currentEmbeddingFingerprint =
      pdfIndexDBManager.getEmbeddingFingerprint(
        params.mainDbName,
        params.pdfId,
      );
    const currentVecDimensions = pdfIndexDBManager.getVectorDimensions(
      params.mainDbName,
      params.pdfId,
    );
    const vectorAvailable =
      Boolean(embeddingConfig) &&
      currentEmbeddingFingerprint === (embeddingConfig?.fingerprint || null) &&
      (!currentVecDimensions ||
        currentVecDimensions === embeddingConfig?.dimensions);

    let vecResults: PdfSectionSummary[] = [];
    if (vectorAvailable && embeddingConfig) {
      const queryEmbedding = (
        await this.embedTexts([params.query], embeddingConfig)
      )[0];
      if (queryEmbedding?.length) {
        vecResults = pdfIndexDBManager.searchSectionVec(
          params.mainDbName,
          params.pdfId,
          queryEmbedding,
          limit,
          embeddingConfig.distance,
        );
      }
    }

    const merged = new Map<string, PdfSectionSummary>();
    const upsert = (summary: PdfSectionSummary) => {
      const previous = merged.get(summary.sectionId);
      if (!previous) {
        merged.set(summary.sectionId, summary);
        return;
      }
      merged.set(summary.sectionId, {
        ...previous,
        score: Math.max(previous.score || 0, summary.score || 0),
        source:
          previous.source && previous.source !== summary.source
            ? "hybrid"
            : summary.source || previous.source,
      });
    };

    ftsResults.forEach(upsert);
    vecResults.forEach(upsert);

    return [...merged.values()]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  private getPdfRecord(mainDbName: string, pdfId: number) {
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      throw new Error(`数据库未连接: ${mainDbName}`);
    }
    return PdfTable.getPdfById(db, pdfId);
  }

  getDocumentMap(
    mainDbName: string,
    pdfId: number,
    depth?: number,
  ): PdfDocumentMap {
    const pdf = this.getPdfRecord(mainDbName, pdfId);
    return pdfIndexDBManager.getDocumentMap(mainDbName, pdfId, {
      fileName: pdf.fileName,
      depth,
    });
  }

  async getDocumentInfo(
    mainDbName: string,
    pdfId: number,
  ): Promise<PdfDocumentInfo> {
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
