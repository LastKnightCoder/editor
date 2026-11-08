import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { current, Immer, isDraft } from "immer";
import type { SubagentSession, SubagentRun, SubagentParentMessage } from "@/types/subagent";

export interface SubagentRecords {
  version: 1;
  generation: number;
  agents: SubagentSession[];
  runs: SubagentRun[];
  messages: SubagentParentMessage[];
}

/** 编排记录按父会话保存；聊天正文仍由 pi JSONL 持有。 */
export class SubagentRepository {
  private readonly records = new Map<string, SubagentRecords>();
  private readonly producer = new Immer({ autoFreeze: false });

  constructor(private readonly root: string) {}

  directory(parentKey: string): string {
    return join(this.root, createHash("sha256").update(parentKey).digest("hex"));
  }

  read(parentKey: string): SubagentRecords {
    const loaded = this.records.get(parentKey);
    if (loaded) return loaded;
    const file = join(this.directory(parentKey), "state.json");
    const state: SubagentRecords = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : { version: 1, generation: 0, agents: [], runs: [], messages: [] };
    if (
      state.version !== 1 ||
      !Array.isArray(state.agents) ||
      !Array.isArray(state.runs) ||
      !Array.isArray(state.messages)
    ) {
      throw new Error("子 Agent 记录格式不支持");
    }
    let changed = false;
    for (const run of state.runs) {
      if (run.status !== "running" && run.status !== "queued") continue;
      changed = true;
      run.status = "interrupted";
      run.finishedAt = Date.now();
      run.outcome = {
        status: "interrupted",
        error: { message: "上次执行宿主已退出，执行未自动重放" },
      };
      state.messages.push({
        messageId: `terminal:${run.runId}`,
        agentId: run.agentId,
        runId: run.runId,
        origin: run.origin,
        payload: { kind: "terminal", outcome: run.outcome },
        delivered: false,
      });
    }
    if (changed) this.save(parentKey, state);
    this.records.set(parentKey, state);
    return state;
  }

  update<T>(parentKey: string, update: (state: SubagentRecords) => T): T {
    const previous = this.read(parentKey);
    let result: T | undefined;
    const next = this.producer.produce(previous, draft => {
      const value = update(draft);
      result = isDraft(value) ? current(value) : value;
    });
    if (next !== previous) {
      this.save(parentKey, next);
      this.records.set(parentKey, next);
    }
    return result as T;
  }

  /** 父对话已删除：丢掉内存记录并删除整个编排目录（含子会话历史） */
  remove(parentKey: string): void {
    this.records.delete(parentKey);
    rmSync(this.directory(parentKey), { recursive: true, force: true });
  }

  private save(parentKey: string, state: SubagentRecords): void {
    const dir = this.directory(parentKey);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "state.json");
    writeFileSync(`${file}.tmp`, JSON.stringify(state), {
      mode: 0o600,
      flush: true,
    });
    renameSync(`${file}.tmp`, file);
  }
}
