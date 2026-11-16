import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import log from "electron-log";
import { rgPath } from "@vscode/ripgrep";
import { toUnpackedAsarPath } from "../../utils/asarPath";
import databaseModule from "../database";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import vibeLearningDBManager from "../vibe-learning-db";
import embeddingService from "../embedding-service";
import { runSearchPipeline } from "../search-core/pipeline";
import { createVibeLearningAdapter } from "../search-core/vibe-learning-adapter";
import { buildLineStartOffsets, parseRipgrepJsonLines } from "../vibe-learning-resource-read-utils";
import type { VLSearchResult } from "@/types/vibe-learning";
import type { VibeLearningIndexQueue } from "./index";
import { toEmbeddingTarget } from "./types";
import { getAbsoluteMarkdownPath } from "./markdown-store";

const MAX_GREP_RESULTS = 100;
const GREP_PREVIEW_RADIUS = 80;

// 打包后 rgPath 指向 app.asar 内的 rg.exe，而 spawn 不做 asar 重定向，
// 必须换成 app.asar.unpacked 中的实体文件，否则 grep 会报 spawn ENOENT
const ripgrepBinaryPath = toUnpackedAsarPath(rgPath);

export async function searchContent(
  manager: VibeLearningIndexQueue,
  params: {
    projectId: number;
    mainDbName: string;
    query: string;
    limit?: number;
  }
): Promise<VLSearchResult[]> {
  const { projectId, mainDbName, query, limit = 5 } = params;

  log.info(
    `[VibeLearningIndexQueue] Searching content: projectId=${projectId}, query="${query}", limit=${limit}`
  );

  try {
    const embeddingConfig = await manager.getEmbeddingConfig();
    log.info("[SearchCore][vibe-learning][config]", {
      query,
      limit,
      projectId,
      mainDbName,
      vectorEnabled: Boolean(embeddingConfig),
      vectorModel: embeddingConfig?.model,
    });

    const adapter = createVibeLearningAdapter();
    const { results, log: pipelineLog } = await runSearchPipeline({
      query,
      limit,
      context: {
        projectId,
        mainDbName,
        vector: embeddingConfig
          ? {
              distance: embeddingConfig.distance,
              embedQuery: async (queryText: string) => {
                try {
                  const queryEmbedding = (
                    await embeddingService.embedTexts(
                      toEmbeddingTarget(embeddingConfig),
                      [queryText],
                      { interactive: true }
                    )
                  )[0];
                  return queryEmbedding || null;
                } catch (error) {
                  log.error(`[VibeLearningIndexQueue] Vec query embedding failed: ${error}`);
                  return null;
                }
              },
            }
          : null,
      },
      adapter,
      logger: pipelineState => {
        log.info("[SearchCore][vibe-learning]", pipelineState);
      },
      stageLogger: stageLog => {
        log.info(`[SearchCore][vibe-learning][${stageLog.stage}]`, stageLog);
      },
    });

    log.info(
      `[VibeLearningIndexQueue] Hybrid search completed: found ${results.length} results (FTS: ${pipelineLog.ftsCount}, Vec: ${pipelineLog.vecCount})`
    );

    const enrichedResults = results.map(result => {
      const chunkMetadata =
        typeof result.chunkIndex === "number"
          ? vibeLearningDBManager.getChunkMetadata(
              mainDbName,
              projectId,
              result.resourceId,
              result.chunkIndex
            )
          : null;

      return {
        ...result,
        displayContent: chunkMetadata?.displayContent || result.content,
        searchContent: chunkMetadata?.searchContent || result.content,
        chunkStartLine: chunkMetadata?.chunkStartLine,
        chunkEndLine: chunkMetadata?.chunkEndLine,
        startOffset: chunkMetadata?.startOffset,
        endOffset: chunkMetadata?.endOffset,
        charCount: chunkMetadata?.charCount,
        chunkLevel: "passage",
        evidenceScore: result.score,
        whyMatched: "命中正文内容，可使用返回的行号或字符范围继续补读上下文。",
      };
    });

    return enrichedResults.map((result): VLSearchResult => ({
      ...result,
      displayContent: String(result.displayContent || result.content),
      searchContent: String(result.searchContent || result.content),
      chunkLevel: (result.chunkLevel as VLSearchResult["chunkLevel"]) || "passage",
      evidenceScore: typeof result.evidenceScore === "number" ? result.evidenceScore : result.score,
      whyMatched: String(result.whyMatched || "命中正文内容，可继续补读上下文。"),
    }));
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Search failed: ${error}`);
    return [];
  }
}

export async function grepContent(params: {
  projectId: number;
  mainDbName: string;
  query: string;
  isRegex?: boolean;
  ignoreCase?: boolean;
  limit?: number;
}): Promise<{
  success: boolean;
  query: string;
  results: Array<{
    resourceId: number;
    resourceName: string;
    lineNumber: number;
    startOffset: number;
    endOffset: number;
    matchedText: string;
    preview: string;
  }>;
  error?: string;
}> {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const limit = Math.min(Math.max(1, Math.floor(params.limit || 20)), MAX_GREP_RESULTS);

  if (!query) {
    return {
      success: false,
      query: typeof params.query === "string" ? params.query : "",
      results: [],
      error: "缺少必需的 query 参数",
    };
  }

  try {
    const db = databaseModule.getDatabase(params.mainDbName);
    if (!db) {
      return {
        success: false,
        query,
        results: [],
        error: "Database not found",
      };
    }

    const resources = VibeLearningResourceTable.getResourcesByProjectId(
      db,
      params.projectId
    ).filter(resource => Boolean(resource.markdownPath));
    const pathToResource = new Map<string, { id: number; name: string; markdownPath: string }>();
    const filePaths = resources.map(resource => {
      const markdownPath = resource.markdownPath as string;
      const absolutePath = getAbsoluteMarkdownPath(markdownPath);
      pathToResource.set(absolutePath, {
        id: resource.id,
        name: resource.name,
        markdownPath,
      });
      return absolutePath;
    });

    if (filePaths.length === 0) {
      return {
        success: true,
        query,
        results: [],
      };
    }

    const args = [
      "--json",
      "--line-number",
      "--column",
      "--with-filename",
      "--no-heading",
      "--max-count",
      String(limit),
    ];
    if (!params.isRegex) {
      args.push("--fixed-strings");
    }
    if (params.ignoreCase) {
      args.push("--ignore-case");
    }
    args.push(query, ...filePaths);

    const child = spawn(ripgrepBinaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderrChunks: Buffer[] = [];

    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const stdoutLines = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    const resultsPromise = parseRipgrepJsonLines({
      lines: stdoutLines,
      pathToResource,
      limit,
      previewRadius: GREP_PREVIEW_RADIUS,
      getLineStartOffsets: buildLineStartOffsets,
      onLimitReached: () => {
        child.kill();
      },
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const results = await resultsPromise;

    const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
    if (exitCode !== 0 && exitCode !== 1 && results.length < limit) {
      return {
        success: false,
        query,
        results: [],
        error: stderr || `ripgrep failed with code ${exitCode}`,
      };
    }

    return {
      success: true,
      query,
      results,
    };
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Grep failed: ${error}`);
    return {
      success: false,
      query,
      results: [],
      error: `grep 查询失败: ${(error as Error).message}`,
    };
  }
}
