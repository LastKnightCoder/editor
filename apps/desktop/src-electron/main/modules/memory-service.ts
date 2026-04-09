import { ipcMain } from "electron";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ChatMessage,
  DeleteWithMemoryResult,
  DiaryEntry,
  MemoryCheckpointRecord,
  MemorySearchHit,
  MemorySearchParams,
  MemorySourceType,
  MemoryStatus,
} from "@/types";
import { getMarkdown } from "@/utils/markdown.ts";
import type { Module } from "../types/module";
import databaseModule from "./database";
import ChatMessageTable from "./tables/chat-message";
import DiaryTable from "./tables/diary";
import pythonService from "./python-service";
import memoryStateDb from "./memory-state-db";
import {
  ensureMemoryDbDir,
  getMemoryPalacePath,
  getMemoryStateDbPath,
  getMemoryStagingDir,
} from "./utils/memory-storage";

type MemoryRpcCommon = {
  mainDbName: string;
  palacePath: string;
  stateDbPath: string;
};

type ArchiveResult = {
  success: boolean;
  drawerIds?: string[];
  rooms?: string[];
  error?: string;
};

const ROOMLESS_CHAT_HASH = "empty";
const CHAT_IDLE_ARCHIVE_MS = 90 * 1000;

const extractTextFromMessageContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (item): item is { type: string; text?: string } =>
        typeof item === "object" && item !== null && "type" in item,
    )
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join("\n");
};

const normalizeChatTranscript = (chat: ChatMessage): string => {
  const lines: string[] = [];
  for (const message of chat.messages) {
    const role = (message as { role?: string }).role;
    if (!role) {
      continue;
    }
    if (role === "tool") {
      continue;
    }
    const text = extractTextFromMessageContent(
      (message as { content?: unknown }).content,
    );
    if (!text) {
      continue;
    }
    if (role === "user") {
      lines.push(`> ${text}`);
    } else {
      lines.push(text);
    }
    lines.push("---");
  }
  return lines.join("\n").trim();
};

const normalizeDiaryMarkdown = (entry: DiaryEntry): string => {
  const markdown = getMarkdown(entry.content || []).trim();
  if (!markdown) {
    return "";
  }
  const meta: string[] = [];
  if (entry.type) {
    meta.push(`type: ${entry.type}`);
  }
  if (entry.date) {
    meta.push(`date: ${entry.date}`);
  }
  if (entry.mood) {
    meta.push(`mood: ${JSON.stringify(entry.mood)}`);
  }
  if (entry.weather) {
    meta.push(`weather: ${JSON.stringify(entry.weather)}`);
  }
  if (meta.length === 0) {
    return markdown;
  }
  return [`---`, ...meta, `---`, "", markdown].join("\n");
};

const computeArchiveHash = (text: string): string => {
  if (!text) {
    return ROOMLESS_CHAT_HASH;
  }
  return createHash("sha256").update(text).digest("hex");
};

const writeStagingFile = (
  mainDbName: string,
  sourceType: MemorySourceType,
  sourceId: number,
  archiveHash: string,
  content: string,
  extension: "txt" | "md",
) => {
  ensureMemoryDbDir(mainDbName);
  const stagingDir = getMemoryStagingDir(mainDbName);
  const filePath = join(
    stagingDir,
    `${sourceType}-${sourceId}-${archiveHash.slice(0, 16)}.${extension}`,
  );
  writeFileSync(filePath, content, "utf8");
  return filePath;
};

class MemoryService implements Module {
  name = "memory-service";
  private chatArchiveTimers = new Map<string, NodeJS.Timeout>();

  async init(): Promise<void> {
    ipcMain.handle("memory-status", async () => {
      const mainDbName = databaseModule.getCurrentDatabaseName();
      return this.getStatus(mainDbName);
    });

    ipcMain.handle(
      "memory-search",
      async (_event, params: MemorySearchParams) => {
        return this.search(params);
      },
    );

    ipcMain.handle(
      "memory-get-source-context",
      async (
        _event,
        params: { sourceType: MemorySourceType; sourceId: number },
      ) => {
        return this.getSourceContext(params.sourceType, params.sourceId);
      },
    );

    ipcMain.handle("memory-rebuild-current-db", async () => {
      const mainDbName = databaseModule.getCurrentDatabaseName();
      await this.clearCurrentDatabase(mainDbName);
      return { success: true };
    });

    ipcMain.handle(
      "memory-rebuild-chat",
      async (_event, params: { chatId: number }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        await this.clearSource(mainDbName, "chat", params.chatId);
        return { success: true };
      },
    );

    ipcMain.handle(
      "memory-rebuild-diary",
      async (_event, params: { diaryId: number }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        await this.clearSource(mainDbName, "diary", params.diaryId);
        return { success: true };
      },
    );

    ipcMain.handle(
      "memory-delete-chat-sources",
      async (_event, params: { chatIds: number[] }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        await this.clearSources(mainDbName, "chat", params.chatIds || []);
        return { success: true };
      },
    );

    ipcMain.handle(
      "memory-delete-diary-source",
      async (_event, params: { diaryId: number }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        await this.clearSource(mainDbName, "diary", params.diaryId);
        return { success: true };
      },
    );

    ipcMain.handle(
      "memory-delete-chat-message",
      async (_event, params: { chatId: number }) => {
        return this.deleteChatMessageWithMemory(params.chatId);
      },
    );

    ipcMain.handle(
      "memory-delete-diary-entry",
      async (_event, params: { diaryId: number }) => {
        return this.deleteDiaryEntryWithMemory(params.diaryId);
      },
    );

    ipcMain.handle(
      "memory-touch-chat-session",
      async (_event, params: { chatId: number }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        this.scheduleChatIdleArchive(mainDbName, params.chatId);
        return { success: true };
      },
    );

    ipcMain.handle(
      "memory-flush-chat-session",
      async (_event, params: { chatId: number }) => {
        const mainDbName = databaseModule.getCurrentDatabaseName();
        await this.flushChatSession(mainDbName, params.chatId);
        return { success: true };
      },
    );
  }

  ensureSidecar(mainDbName: string): MemoryRpcCommon {
    ensureMemoryDbDir(mainDbName);
    memoryStateDb.ensureReady(mainDbName);
    return {
      mainDbName,
      palacePath: getMemoryPalacePath(mainDbName),
      stateDbPath: getMemoryStateDbPath(mainDbName),
    };
  }

  getStatus(mainDbName: string): MemoryStatus {
    return memoryStateDb.summarize(mainDbName);
  }

  unloadDatabase(mainDbName: string): void {
    for (const [key, timer] of this.chatArchiveTimers.entries()) {
      if (!key.startsWith(`${mainDbName}::`)) {
        continue;
      }
      clearTimeout(timer);
      this.chatArchiveTimers.delete(key);
    }
    memoryStateDb.closeDatabase(mainDbName);
  }

  private getChatTimerKey(mainDbName: string, chatId: number): string {
    return `${mainDbName}::${chatId}`;
  }

  scheduleChatIdleArchive(mainDbName: string, chatId: number): void {
    if (!chatId || chatId <= 0) {
      return;
    }
    const key = this.getChatTimerKey(mainDbName, chatId);
    const existing = this.chatArchiveTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      void this.flushChatSession(mainDbName, chatId);
    }, CHAT_IDLE_ARCHIVE_MS);
    this.chatArchiveTimers.set(key, timer);
  }

  async flushChatSession(mainDbName: string, chatId: number): Promise<void> {
    if (!chatId || chatId <= 0) {
      return;
    }
    const key = this.getChatTimerKey(mainDbName, chatId);
    const timer = this.chatArchiveTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.chatArchiveTimers.delete(key);
    }

    const mainDb = databaseModule.getDatabase(mainDbName);
    if (!mainDb) {
      return;
    }
    const chat = ChatMessageTable.getChatMessageById(mainDb, chatId);
    if (!chat || !chat.messages || chat.messages.length <= 1) {
      return;
    }

    const checkpoint = this.buildCheckpointForChat(chat);
    if (!this.shouldArchive(mainDbName, checkpoint)) {
      return;
    }

    try {
      const result = await this.archiveChat(mainDbName, chat);
      if (!result.success) {
        throw new Error(result.error || "memory archive failed");
      }
      this.completeArchive(
        mainDbName,
        checkpoint,
        result.drawerIds || [],
        result.rooms || [],
      );
    } catch (error) {
      this.failArchive(mainDbName, checkpoint, error);
    }
  }

  markInterruptedJobs(mainDbName: string): number {
    return memoryStateDb.markRunningJobsInterrupted(mainDbName);
  }

  async search(
    params: MemorySearchParams,
  ): Promise<{ query: string; hits: MemorySearchHit[] }> {
    const request = {
      ...this.ensureSidecar(databaseModule.getCurrentDatabaseName()),
      ...params,
    };
    await pythonService.init();
    const client = await pythonService.ensureStarted();
    const result = await client.request<{
      hits?: MemorySearchHit[];
      query: string;
    }>("memory_search", request);
    return {
      query: result?.query || params.query,
      hits: result?.hits || [],
    };
  }

  async getSourceContext(
    sourceType: MemorySourceType,
    sourceId: number,
  ): Promise<Record<string, unknown>> {
    const mainDbName = databaseModule.getCurrentDatabaseName();
    const mainDb = databaseModule.getCurrentDatabase();
    if (!mainDb) {
      throw new Error("当前数据库未连接");
    }
    if (sourceType === "chat") {
      const chat = ChatMessageTable.getChatMessageByIdOrNull(mainDb, sourceId);
      if (!chat) {
        memoryStateDb.markSourceStale(
          mainDbName,
          "chat",
          sourceId,
          "chat_source_not_found",
        );
        return {
          sourceType,
          sourceId,
          status: "not_found",
          message: "原始聊天记录不存在，可能已被删除。",
        };
      }
      return {
        sourceType,
        sourceId,
        title: chat.title,
        updateTime: chat.updateTime,
        transcript: normalizeChatTranscript(chat),
      };
    }
    const entry = DiaryTable.getDiaryEntryByIdOrNull(mainDb, sourceId);
    if (!entry) {
      memoryStateDb.markSourceStale(
        mainDbName,
        "diary",
        sourceId,
        "diary_source_not_found",
      );
      return {
        sourceType,
        sourceId,
        status: "not_found",
        message: "原始日记记录不存在，可能已被删除。",
      };
    }
    return {
      sourceType,
      sourceId,
      type: entry.type,
      date: entry.date,
      updateTime: entry.updateTime,
      markdown: normalizeDiaryMarkdown(entry as unknown as DiaryEntry),
    };
  }

  collectChats(mainDbName: string): ChatMessage[] {
    const mainDb = databaseModule.getDatabase(mainDbName);
    if (!mainDb) {
      return [];
    }
    return ChatMessageTable.getAllChatMessages(mainDb);
  }

  collectDiaries(mainDbName: string): DiaryEntry[] {
    const mainDb = databaseModule.getDatabase(mainDbName);
    if (!mainDb) {
      return [];
    }
    return DiaryTable.getAllDiaryEntries(mainDb) as unknown as DiaryEntry[];
  }

  buildCheckpointForChat(chat: ChatMessage): MemoryCheckpointRecord {
    const transcript = normalizeChatTranscript(chat);
    return {
      sourceType: "chat",
      sourceId: chat.id,
      sourceVersion: Number(chat.updateTime || 0),
      archiveHash: computeArchiveHash(transcript),
      archiveState: "pending",
      lastArchivedAt: null,
      lastError: null,
    };
  }

  buildCheckpointForDiary(entry: DiaryEntry): MemoryCheckpointRecord {
    const markdown = normalizeDiaryMarkdown(entry);
    return {
      sourceType: "diary",
      sourceId: entry.id,
      sourceVersion: Number(entry.updateTime || 0),
      archiveHash: computeArchiveHash(markdown),
      archiveState: "pending",
      lastArchivedAt: null,
      lastError: null,
    };
  }

  shouldArchive(
    mainDbName: string,
    checkpoint: MemoryCheckpointRecord,
  ): boolean {
    const current = memoryStateDb.getCheckpoint(
      mainDbName,
      checkpoint.sourceType,
      checkpoint.sourceId,
    );
    if (!current) {
      return true;
    }
    if (current.archiveState === "failed" || current.archiveState === "stale") {
      return true;
    }
    if (current.sourceVersion !== checkpoint.sourceVersion) {
      return true;
    }
    if (current.archiveHash !== checkpoint.archiveHash) {
      return true;
    }
    return false;
  }

  async archiveChat(
    mainDbName: string,
    chat: ChatMessage,
  ): Promise<ArchiveResult> {
    const transcript = normalizeChatTranscript(chat);
    const archiveHash = computeArchiveHash(transcript);
    const transcriptPath = writeStagingFile(
      mainDbName,
      "chat",
      chat.id,
      archiveHash,
      transcript,
      "txt",
    );
    const common = this.ensureSidecar(mainDbName);
    await pythonService.init();
    const client = await pythonService.ensureStarted();
    return client.request<ArchiveResult>("memory_archive_chat", {
      ...common,
      chatId: chat.id,
      title: chat.title,
      updateTime: Number(chat.updateTime || 0),
      archiveHash,
      transcriptPath,
      parentChatId: chat.parentChatId ?? null,
      branchIndex: chat.branchIndex ?? 0,
    });
  }

  async archiveDiary(
    mainDbName: string,
    diary: DiaryEntry,
  ): Promise<ArchiveResult> {
    const markdown = normalizeDiaryMarkdown(diary);
    const archiveHash = computeArchiveHash(markdown);
    const markdownPath = writeStagingFile(
      mainDbName,
      "diary",
      diary.id,
      archiveHash,
      markdown,
      "md",
    );
    const common = this.ensureSidecar(mainDbName);
    await pythonService.init();
    const client = await pythonService.ensureStarted();
    return client.request<ArchiveResult>("memory_archive_diary", {
      ...common,
      diaryId: diary.id,
      diaryType: diary.type,
      date: diary.date,
      updateTime: Number(diary.updateTime || 0),
      archiveHash,
      markdownPath,
      mood: diary.mood ?? null,
      weather: diary.weather ?? null,
    });
  }

  completeArchive(
    mainDbName: string,
    checkpoint: MemoryCheckpointRecord,
    drawerIds: string[],
    rooms: string[],
  ): void {
    memoryStateDb.upsertCheckpoint(mainDbName, {
      ...checkpoint,
      archiveState: "done",
      lastArchivedAt: Date.now(),
      lastError: null,
    });
    memoryStateDb.replaceDrawerMappings(
      mainDbName,
      checkpoint.sourceType,
      checkpoint.sourceId,
      checkpoint.sourceVersion,
      drawerIds.map((drawerId, index) => ({
        drawerId,
        chunkIndex: index,
        room: rooms[index] || rooms[0] || "general",
        contentHash: checkpoint.archiveHash,
      })),
    );
  }

  failArchive(
    mainDbName: string,
    checkpoint: MemoryCheckpointRecord,
    error: unknown,
  ): void {
    memoryStateDb.upsertCheckpoint(mainDbName, {
      ...checkpoint,
      archiveState: "failed",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  async clearSource(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
  ): Promise<void> {
    const drawerIds = memoryStateDb.getDrawerIdsForSource(
      mainDbName,
      sourceType,
      sourceId,
    );
    if (drawerIds.length > 0) {
      await pythonService.init();
      const client = await pythonService.ensureStarted();
      await client.request("memory_delete_drawers", {
        ...this.ensureSidecar(mainDbName),
        drawerIds,
      });
    }
    memoryStateDb.clearSource(mainDbName, sourceType, sourceId);
  }

  async clearSources(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceIds: number[],
  ): Promise<void> {
    for (const sourceId of sourceIds) {
      await this.clearSource(mainDbName, sourceType, sourceId);
    }
  }

  async deleteChatMessageWithMemory(
    chatId: number,
  ): Promise<DeleteWithMemoryResult> {
    const mainDbName = databaseModule.getCurrentDatabaseName();
    const mainDb = databaseModule.getCurrentDatabase();
    if (!mainDb) {
      throw new Error("当前数据库未连接");
    }

    const allIdsToDelete = [
      chatId,
      ...ChatMessageTable.getAllChildBranches(mainDb, chatId),
    ];

    let deletedCount = 0;
    try {
      deletedCount = ChatMessageTable.deleteChatMessage(mainDb, chatId);
    } catch (error) {
      return {
        deletedCount: 0,
        mainDeleteSucceeded: false,
        memoryCleanupSucceeded: false,
        memoryCleanupError:
          error instanceof Error ? error.message : String(error),
      };
    }

    try {
      await this.clearSources(mainDbName, "chat", allIdsToDelete);
      return {
        deletedCount,
        mainDeleteSucceeded: true,
        memoryCleanupSucceeded: true,
        memoryCleanupError: null,
      };
    } catch (error) {
      return {
        deletedCount,
        mainDeleteSucceeded: true,
        memoryCleanupSucceeded: false,
        memoryCleanupError:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteDiaryEntryWithMemory(
    diaryId: number,
  ): Promise<DeleteWithMemoryResult> {
    const mainDbName = databaseModule.getCurrentDatabaseName();
    const mainDb = databaseModule.getCurrentDatabase();
    if (!mainDb) {
      throw new Error("当前数据库未连接");
    }

    let deletedCount = 0;
    try {
      deletedCount = DiaryTable.deleteDiaryEntry(mainDb, diaryId);
    } catch (error) {
      return {
        deletedCount: 0,
        mainDeleteSucceeded: false,
        memoryCleanupSucceeded: false,
        memoryCleanupError:
          error instanceof Error ? error.message : String(error),
      };
    }

    try {
      await this.clearSource(mainDbName, "diary", diaryId);
      return {
        deletedCount,
        mainDeleteSucceeded: true,
        memoryCleanupSucceeded: true,
        memoryCleanupError: null,
      };
    } catch (error) {
      return {
        deletedCount,
        mainDeleteSucceeded: true,
        memoryCleanupSucceeded: false,
        memoryCleanupError:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  async clearCurrentDatabase(mainDbName: string): Promise<void> {
    const chats = this.collectChats(mainDbName);
    for (const chat of chats) {
      await this.clearSource(mainDbName, "chat", chat.id);
    }
    const diaries = this.collectDiaries(mainDbName);
    for (const diary of diaries) {
      await this.clearSource(mainDbName, "diary", diary.id);
    }
  }

  startJob(mainDbName: string, jobType: string, totalCount: number): string {
    const jobId = randomUUID();
    memoryStateDb.startJob(mainDbName, jobId, jobType, totalCount);
    return jobId;
  }

  recordJobItem(
    mainDbName: string,
    jobId: string,
    sourceType: MemorySourceType,
    sourceId: number,
    itemState: "running" | "done" | "failed",
    lastError?: string | null,
  ): void {
    memoryStateDb.upsertJobItem(
      mainDbName,
      jobId,
      sourceType,
      sourceId,
      itemState,
      lastError,
    );
  }

  finishJob(
    mainDbName: string,
    jobId: string,
    status: "completed" | "failed" | "cancelled",
    processedCount: number,
    failedCount: number,
  ): void {
    memoryStateDb.finishJob(
      mainDbName,
      jobId,
      status,
      processedCount,
      failedCount,
    );
  }
}

export default new MemoryService();
