import log from "electron-log";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import embeddingService from "../embedding-service";
import { smartChunk, smartChunkWithRanges } from "../../utils/smart-chunk";
import vibeLearningDBManager from "../vibe-learning-db";
import { assertIndexCreated } from "../vibe-learning-resource-read-utils";
import type { VibeLearningIndexQueue } from "./index";
import { toEmbeddingTarget, type IndexTask } from "./types";

const jieba = Jieba.withDict(dict);

export async function createIndex(
  manager: VibeLearningIndexQueue,
  mainDbName: string,
  projectId: number,
  resourceId: number,
  content: string,
  task?: Pick<IndexTask, "resourceId" | "generation">
): Promise<void> {
  if (task) {
    manager.throwIfTaskStale(task, "create_index_start");
  }

  const chunks = smartChunkWithRanges(content, {
    minLength: 1000,
    maxLength: 2000,
    overlap: 0,
    splitter: "sentence",
  });

  const embeddingConfig = await manager.getEmbeddingConfig();

  const processedChunks: Array<{
    text: string;
    original: string;
    embedding: number[] | undefined;
    searchText?: string;
    displayText?: string;
    chunkStartLine?: number;
    chunkEndLine?: number;
    startOffset?: number;
    endOffset?: number;
    charCount?: number;
  }> = [];

  // 如果有 embedding 配置，批量生成向量
  if (embeddingConfig) {
    log.info(`[VibeLearningIndexQueue] Generating embeddings for ${chunks.length} chunks`);

    // 批量处理以提高效率，每批最多 10 个，每批最多重试 3 次
    const batchSize = embeddingConfig.batchSize || 8;
    const maxRetries = 3;

    for (let i = 0; i < chunks.length; i += batchSize) {
      if (task) {
        manager.throwIfTaskStale(task, "create_index_batch");
      }

      const batchChunks = chunks.slice(i, i + batchSize);
      const batchTexts = batchChunks.map(chunk => chunk.text);
      let batchSuccess = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
            await new Promise(r => setTimeout(r, delay));
            log.info(`[VibeLearningIndexQueue] Retry embedding batch ${i}, attempt ${attempt + 1}`);
          }

          if (task) {
            manager.throwIfTaskStale(task, "create_index_embed");
          }

          const embeddings = await embeddingService.embedTexts(
            toEmbeddingTarget(embeddingConfig),
            batchTexts
          );

          for (let j = 0; j < batchChunks.length; j++) {
            const chunk = batchChunks[j];
            const chunkText = chunk.text;
            const segmented = jieba.cutForSearch(chunkText, true).join(" ");
            processedChunks.push({
              text: segmented,
              original: chunkText,
              embedding: embeddings[j],
              searchText: segmented,
              displayText: chunkText,
              chunkStartLine: chunk.startLine,
              chunkEndLine: chunk.endLine,
              startOffset: chunk.startOffset,
              endOffset: chunk.endOffset,
              charCount: chunk.charCount,
            });
          }
          batchSuccess = true;
          break;
        } catch (error) {
          log.warn(
            `[VibeLearningIndexQueue] Embedding batch ${i} attempt ${attempt + 1} failed: ${error}`
          );
        }
      }

      if (!batchSuccess) {
        log.error(
          `[VibeLearningIndexQueue] Embedding batch ${i} failed after ${maxRetries} retries, degrading to FTS only`
        );
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          const chunkText = chunk.text;
          const segmented = jieba.cutForSearch(chunkText, true).join(" ");
          processedChunks.push({
            text: segmented,
            original: chunkText,
            embedding: undefined,
            searchText: segmented,
            displayText: chunkText,
            chunkStartLine: chunk.startLine,
            chunkEndLine: chunk.endLine,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            charCount: chunk.charCount,
          });
        }
      }
    }

    log.info(`[VibeLearningIndexQueue] Generated embeddings for resource ${resourceId}`);
  } else {
    // 没有 embedding 配置，只创建 FTS 索引
    for (const chunk of chunks) {
      const chunkText = chunk.text;
      const segmented = jieba.cutForSearch(chunkText, true).join(" ");
      processedChunks.push({
        text: segmented,
        original: chunkText,
        embedding: undefined,
        searchText: segmented,
        displayText: chunkText,
        chunkStartLine: chunk.startLine,
        chunkEndLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        charCount: chunk.charCount,
      });
    }
  }

  // 创建索引
  if (task) {
    manager.throwIfTaskStale(task, "create_index_commit");
  }

  const indexCreated = vibeLearningDBManager.createIndex(
    mainDbName,
    projectId,
    resourceId,
    content,
    processedChunks
  );
  assertIndexCreated(indexCreated, resourceId);
}

export async function createEmbeddingOnly(
  manager: VibeLearningIndexQueue,
  mainDbName: string,
  projectId: number,
  resourceId: number,
  content: string,
  task?: Pick<IndexTask, "resourceId" | "generation">
): Promise<void> {
  if (task) {
    manager.throwIfTaskStale(task, "embedding_only_start");
  }

  const embeddingConfig = await manager.getEmbeddingConfig();
  if (!embeddingConfig) {
    log.warn(
      `[VibeLearningIndexQueue] No embedding config, skipping embedding for resource ${resourceId}`
    );
    return;
  }

  // 分块
  const chunks = smartChunk(content, {
    minLength: 1000,
    maxLength: 2000,
    overlap: 0,
    splitter: "sentence",
  });

  log.info(`[VibeLearningIndexQueue] Generating embeddings only for ${chunks.length} chunks`);

  const processedChunks: Array<{ text: string; embedding: number[] }> = [];

  // 批量处理，每批最多重试 3 次
  const batchSize = embeddingConfig.batchSize || 8;
  const maxRetries = 3;
  const totalBatches = Math.ceil(chunks.length / batchSize);
  let completedBatches = 0;
  let failedBatches = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    if (task) {
      manager.throwIfTaskStale(task, "embedding_only_batch");
    }

    const batchChunks = chunks.slice(i, i + batchSize);
    let batchSuccess = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
          await new Promise(r => setTimeout(r, delay));
          log.info(
            `[VibeLearningIndexQueue] Retry embedding-only batch ${i}, attempt ${attempt + 1}`
          );
        }

        if (task) {
          manager.throwIfTaskStale(task, "embedding_only_embed");
        }

        const embeddings = await embeddingService.embedTexts(
          toEmbeddingTarget(embeddingConfig),
          batchChunks
        );

        for (let j = 0; j < batchChunks.length; j++) {
          const chunkText = batchChunks[j];
          const embedding = embeddings[j];
          if (embedding) {
            processedChunks.push({
              text: chunkText,
              embedding,
            });
          }
        }
        batchSuccess = true;
        break;
      } catch (error) {
        log.warn(
          `[VibeLearningIndexQueue] Embedding-only batch ${i} attempt ${attempt + 1} failed: ${error}`
        );
      }
    }

    if (batchSuccess) {
      completedBatches++;
    } else {
      failedBatches++;
      log.error(
        `[VibeLearningIndexQueue] Embedding-only batch ${i} failed after ${maxRetries} retries, skipping batch`
      );
    }

    // 上报 embedding 进度
    manager.sendStatusWithProgress(resourceId, "embedding", {
      total: totalBatches,
      completed: completedBatches,
      failed: failedBatches,
      inProgress: totalBatches - completedBatches - failedBatches,
    });
  }

  // 仅添加向量索引
  if (task) {
    manager.throwIfTaskStale(task, "embedding_only_commit");
  }

  vibeLearningDBManager.addEmbeddingsOnly(mainDbName, projectId, resourceId, processedChunks);

  log.info(`[VibeLearningIndexQueue] Added embeddings for resource ${resourceId}`);
}
