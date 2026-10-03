/**
 * 主题与全局层 AI 洞见、项目回顾的后台调度与 IPC（KL-062 / KL-065）。
 *
 * 后台：连库 2 分钟后、每 30 分钟、项目有改动（归档）半分钟后检查一次；地图过时先重算，
 * 元信息覆盖率够了才按变化量分析主题，再写到期的项目回顾。点「AI 洞见」/「回顾」时立即做。
 * 串行执行；切库、换槽作废进行中的一轮。
 */

import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { InsightStatus } from "@/types/content-insights";
import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPayload,
  KnowledgeInsightsPhase,
} from "@/types/knowledge-insights";
import type { Module } from "../types/module";
import databaseModule from "./database";
import { broadcastDatabaseChange } from "./database-notifications";
import knowledgeMapBuilder from "./knowledge-map-builder";
import { resolveUsageSlot, type LlmRef, type SettingForLlmSlots } from "./llm-usage-slot";
import PiAiRuntimeModule from "./pi-ai-runtime";
import { projectsDue, reviewProject } from "./project-review";
import KnowledgeAiInsightsTable, {
  type KnowledgeAiInsightsRow,
} from "./tables/knowledge-ai-insights";
import KnowledgeMapTable from "./tables/knowledge-map";
import {
  COVERAGE_GATE,
  KNOWLEDGE_INSIGHTS_CHANGED_EVENT,
  TOPIC_INSIGHTS_SLOT,
  analyzeKnowledge,
  buildContext,
  metaCoverage,
  readKnowledgeInsights,
  type TopicInsightsDeps,
} from "./topic-insights";
import userSettingModule from "./user-setting";

/** 连库后等这么久再检查一次（让元信息队列与向量先跑） */
const CONNECT_DELAY_MS = 2 * 60_000;
const CHECK_INTERVAL_MS = 30 * 60_000;
const PROJECT_WRITE_DELAY_MS = 30_000;
const EMPTY_MAP: KnowledgeMap = { nodes: [], topics: [], computedAt: 0 };

const projectNode = (row: KnowledgeAiInsightsRow | null): KnowledgeInsightNode | null =>
  row
    ? {
        id: row.id,
        scope: row.scope,
        parentId: row.parentId,
        projectId: row.projectId,
        label: row.label,
        topicId: null,
        result: row.result,
        model: row.model,
        updateTime: row.updateTime,
      }
    : null;

class KnowledgeInsightsModule implements Module {
  name = "topic-insights";
  private slot: LlmRef | null = null;
  private dbName: string | null = null;
  private generation = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private abort: AbortController | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly deps: TopicInsightsDeps = {
    complete: (request, signal) => PiAiRuntimeModule.complete(request, signal),
    now: () => Date.now(),
  };

  async init() {
    const applySetting = (setting: SettingForLlmSlots) => {
      const next = resolveUsageSlot(setting, TOPIC_INSIGHTS_SLOT);
      if (next?.providerId === this.slot?.providerId && next?.modelId === this.slot?.modelId)
        return;
      this.slot = next;
      this.invalidate();
    };
    applySetting(await userSettingModule.getSettingSnapshot());
    userSettingModule.onSettingChanged(({ newSetting }) => applySetting(newSetting));
    databaseModule.onDatabaseConnected(dbName => this.onConnected(dbName));
    databaseModule.onDatabaseWrite((dbName, eventName) => {
      // 归档即结项：项目一改就稍后检查一次，回顾很快出现在今日页
      if (eventName === "update-project" && dbName === this.dbName) {
        this.scheduleBackground(PROJECT_WRITE_DELAY_MS);
      }
    });
    const current = databaseModule.getCurrentDatabase();
    if (current?.open) this.onConnected(databaseModule.getCurrentDatabaseName());
    setInterval(() => this.scheduleBackground(0), CHECK_INTERVAL_MS).unref?.();

    ipcMain.handle("knowledge-insights:get", async event => {
      const { mainDb, indexDb } = await this.databases(event.sender);
      const map = KnowledgeMapTable.load(indexDb);
      return readKnowledgeInsights(map ? buildContext(mainDb, indexDb, map) : null, mainDb, {
        configured: this.slot !== null,
        running: this.running,
      });
    });
    ipcMain.handle("knowledge-insights:analyze", async event => {
      const slot = this.requireSlot();
      const sender = event.sender;
      const { dbName } = await this.databases(sender);
      return this.enqueue(async () => {
        const result = await this.runTopics(dbName, slot, true, phase => {
          if (!sender.isDestroyed()) sender.send("knowledge-insights:phase", phase);
        });
        if (!result) throw new Error("知识地图还没有准备好");
        return result;
      });
    });
    ipcMain.handle("knowledge-insights:project", async (event, projectId: unknown) => {
      const { mainDb } = await this.databases(event.sender);
      return projectNode(KnowledgeAiInsightsTable.getProject(mainDb, Number(projectId)));
    });
    ipcMain.handle("knowledge-insights:review-project", async (event, projectId: unknown) => {
      const slot = this.requireSlot();
      const { mainDb, indexDb, dbName } = await this.databases(event.sender);
      return this.enqueue(async () => {
        const ctx = buildContext(mainDb, indexDb, KnowledgeMapTable.load(indexDb) ?? EMPTY_MAP);
        const row = await this.withAbort(signal =>
          reviewProject(this.deps, ctx, Number(projectId), slot, signal)
        );
        if (!row) throw new Error("项目不存在");
        broadcastDatabaseChange(KNOWLEDGE_INSIGHTS_CHANGED_EVENT, dbName);
        return projectNode(row);
      });
    });
    ipcMain.handle("knowledge-insights:cancel", async () => {
      this.abort?.abort();
      return true;
    });
    ipcMain.handle(
      "knowledge-insights:set-status",
      async (event, input: { id: number; itemId: string; status: InsightStatus }) => {
        const { mainDb, dbName } = await this.databases(event.sender);
        const ok = KnowledgeAiInsightsTable.setStatus(
          mainDb,
          Number(input?.id),
          String(input?.itemId),
          input?.status
        );
        if (ok) broadcastDatabaseChange(KNOWLEDGE_INSIGHTS_CHANGED_EVENT, dbName);
        return ok;
      }
    );
    log.info("[KnowledgeInsights] Module initialized");
  }

  private requireSlot(): LlmRef {
    if (!this.slot) throw new Error("还没有为「AI 洞见」配置模型");
    return this.slot;
  }

  private onConnected(dbName: string) {
    this.dbName = dbName;
    this.invalidate();
    const mainDb = databaseModule.getDatabase(dbName);
    if (mainDb?.open) {
      const removed = KnowledgeAiInsightsTable.removeOrphans(mainDb);
      if (removed) log.info(`[KnowledgeInsights] 清理孤儿结果 ${removed} 行`);
    }
    this.scheduleBackground(CONNECT_DELAY_MS);
  }

  private invalidate() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async withAbort<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const abort = new AbortController();
    this.abort = abort;
    this.running = true;
    try {
      return await run(abort.signal);
    } finally {
      if (this.abort === abort) this.abort = null;
      this.running = false;
    }
  }

  /** 同一时间只挂一个待执行的后台检查：较早的那个生效 */
  private scheduleBackground(delay: number) {
    if (!this.slot || !this.dbName) return;
    if (this.timer) {
      if (delay > 0) return;
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const dbName = this.dbName;
      const slot = this.slot;
      if (!dbName || !slot) return;
      void this.enqueue(() => this.runBackground(dbName, slot)).catch(error =>
        log.warn("[KnowledgeInsights] 后台分析失败", error)
      );
    }, delay);
    this.timer.unref?.();
  }

  private async runBackground(dbName: string, slot: LlmRef) {
    const payload = await this.runTopics(dbName, slot, false);
    if (!payload) return;
    const generation = this.generation;
    const mainDb = databaseModule.getDatabase(dbName);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    const map = indexDb ? KnowledgeMapTable.load(indexDb) : null;
    if (!mainDb?.open || !indexDb || !map) return;
    const ctx = buildContext(mainDb, indexDb, map);
    for (const due of projectsDue(ctx, this.deps.now())) {
      if (generation !== this.generation) return;
      try {
        await this.withAbort(signal => reviewProject(this.deps, ctx, due.projectId, slot, signal));
        log.info(`[KnowledgeInsights] ${due.kind} 回顾 project=${due.projectId}`);
        broadcastDatabaseChange(KNOWLEDGE_INSIGHTS_CHANGED_EVENT, dbName);
      } catch (error) {
        log.warn(`[KnowledgeInsights] 项目回顾失败 project=${due.projectId}`, error);
        return;
      }
    }
  }

  /** 一轮主题分析；地图不可用返回 null。后台时元信息覆盖率不够就不跑 */
  private async runTopics(
    dbName: string,
    slot: LlmRef,
    force: boolean,
    onPhase?: (phase: KnowledgeInsightsPhase) => void
  ): Promise<KnowledgeInsightsPayload | null> {
    const generation = this.generation;
    const map = await knowledgeMapBuilder.ensureFresh(dbName);
    const mainDb = databaseModule.getDatabase(dbName);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!map || !mainDb?.open || !indexDb || generation !== this.generation) return null;
    const ctx = buildContext(mainDb, indexDb, map);
    if (!force && metaCoverage(ctx) < COVERAGE_GATE) return null;
    const startedAt = Date.now();
    const outcome = await this.withAbort(signal =>
      analyzeKnowledge(this.deps, ctx, slot, {
        force,
        onPhase,
        signal,
        stale: () => generation !== this.generation || !(mainDb as Database.Database).open,
      })
    );
    log.info(
      `[KnowledgeInsights] ${force ? "点击" : "后台"} db=${dbName} subtopics=${outcome.subtopics} topics=${outcome.topics} global=${outcome.global} failures=${outcome.failures} elapsedMs=${Date.now() - startedAt}`
    );
    if (outcome.subtopics || outcome.topics || outcome.global) {
      broadcastDatabaseChange(KNOWLEDGE_INSIGHTS_CHANGED_EVENT, dbName);
    }
    return readKnowledgeInsights(ctx, mainDb, { configured: true, running: false });
  }

  private async databases(sender: Electron.WebContents) {
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb?.open) throw new Error("数据库未就绪");
    await databaseModule.ensureIndexDatabaseReady(dbName, "topic-insights");
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!indexDb) throw new Error("索引库未就绪");
    return { mainDb, indexDb, dbName };
  }
}

export default new KnowledgeInsightsModule();
