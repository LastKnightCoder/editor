import { shell } from "electron";
import type Database from "better-sqlite3";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { basename, join } from "node:path";
import { writeFileSync, renameSync, existsSync } from "node:fs";
import databaseModule from "./database";
import settingModule from "./setting";
import collaborationModule from "./collaboration";
import whiteboardDocumentsModule from "./whiteboard-documents";
import { contentExecutor } from "../services/content-execution";
import { assertLegacyPluginStartupReady } from "../services/plugin-content-artifacts";
import { registerDurableDocuments } from "./durable-document-lifecycle";
import { routeNotification } from "../windows/notification-router";
import PathUtil from "../utils/PathUtil";
import {
  LegacyContentUpgradeQueue,
  type LegacyUpgradeFailure,
  type LegacyUpgradeJob,
} from "./legacy-content-upgrade-queue";

const temporaryFailure = (message: string) =>
  /OFFLINE|fetch failed|ECONN|ENOTFOUND|网络|暂时|连接|超时|未完成保存|等待.*版本|将自动续做/.test(
    message
  );

export class LegacyContentUpgradeModule {
  private readonly processing = new Map<string, Database.Database | null>();
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly notified = new Map<string, string>();
  private readonly libraries = new Set<string>();
  private contracts?: Promise<ContentContractDictionary>;
  private readonly queue = new LegacyContentUpgradeQueue({
    jobs: name => this.jobs(name),
    current: name => {
      const db = this.processing.get(name);
      return db === null
        ? !databaseModule.getDatabase(name)?.open
        : Boolean(db?.open && databaseModule.getDatabase(name) === db);
    },
    finished: (name, failures) => this.finished(name, failures),
    yield: () => new Promise(resolve => setTimeout(resolve, 25)),
  });

  private request(name: string) {
    if (databaseModule.getDatabase(name)?.open || this.libraries.has(name))
      this.queue.request(name);
  }

  private async *jobs(name: string): AsyncGenerator<LegacyUpgradeJob> {
    let connection = databaseModule.getDatabase(name);
    this.processing.set(name, connection?.open ? connection : null);
    if (!connection?.open && this.libraries.has(name)) {
      const file = join(PathUtil.getAppDir(), `${databaseModule.formatDatabaseName(name)}.db`);
      if (!existsSync(file)) throw new Error("配置中的本地资料库文件不存在，未创建空库替代");
      connection = databaseModule.openDatabase(name, "normal");
      databaseModule.databases.set(name, connection);
    }
    if (!connection?.open) return;
    const db = connection;
    this.libraries.delete(name);
    this.processing.set(name, db);
    assertLegacyPluginStartupReady();
    const { state, store } = collaborationModule.documentMigration();
    const current = () => {
      if (!db.open || databaseModule.getDatabase(name) !== db) throw new Error("资料库连接已变化");
    };
    const contracts = () =>
      (this.contracts ??= contentExecutor
        .execute<ContentContractDictionary>({
          operation: "upgrade-contracts",
        })
        .catch(error => {
          this.contracts = undefined;
          throw error;
        }));
    const content = (id: number): LegacyUpgradeJob => ({
      key: `content:${id}`,
      run: async () => {
        const dictionary = await contracts();
        current();
        await collaborationModule.upgradeLegacyContent(name, id, dictionary);
      },
    });
    const board = (id: number): LegacyUpgradeJob => ({
      key: `whiteboard:${id}`,
      run: async () => {
        const dictionary = await contracts();
        current();
        await whiteboardDocumentsModule.upgradeLegacyWhiteboard(name, id, dictionary);
      },
    });
    const shared = (id: string): LegacyUpgradeJob => ({
      key: `shared:${id}`,
      run: async () => {
        const dictionary = await contracts();
        current();
        await collaborationModule.upgradeLegacySession(name, id, dictionary);
      },
    });
    // 回执以文档身份续做，不能依赖主库映射或已恢复的内存会话是否存在。
    const seen = new Set<string>();
    const cached = store.list();
    for (const record of state.pendingMigrations()) {
      if (record.plan.workspaceId !== name) continue;
      let job: LegacyUpgradeJob | undefined;
      if (record.plan.kind === "whiteboard") {
        const installation = JSON.parse(record.plan.prepared.installation);
        if (installation.beforeHash === null && !installation.publication && !record.plan.remote) {
          const page = installation.target.pages[0];
          job = page
            ? board(page.contentId)
            : {
                key: `operation:${record.plan.operationId}`,
                run: async () => {
                  throw new Error("未完成的白板转换缺少原页面，原操作已保留");
                },
              };
        }
      } else if (collaborationModule.isLegacyUpgrade(record)) job = shared(record.plan.documentId);
      if (job && !seen.has(job.key)) {
        seen.add(job.key);
        yield job;
      }
    }
    for (const preparation of state.preparations(name)) {
      if (!collaborationModule.isLegacySession(preparation.documentId)) continue;
      const job = shared(preparation.documentId);
      if (!seen.has(job.key)) {
        seen.add(job.key);
        yield job;
      }
    }
    const candidates = new Map(
      collaborationModule.legacySessions(name).map(session => [session.id, session])
    );
    for (const session of cached)
      if (
        (session.source?.databaseName === name &&
          (!session.source.contentDocumentId || session.error)) ||
        (!session.source && session.error)
      )
        candidates.set(session.id, session);
    for (const session of candidates.values()) {
      const job = session.source ? content(session.source.contentId) : shared(session.id);
      if (!seen.has(job.key)) {
        seen.add(job.key);
        yield job;
      }
    }
    for (const [table, installed, foreignKey, make] of [
      ["contents", "content_documents", "content_id", content],
      ["white_board_contents", "whiteboard_document_pages", "content_id", board],
    ] as const) {
      let cursor = Number.MIN_SAFE_INTEGER;
      while (db.open && databaseModule.getDatabase(name) === db) {
        const rows = db
          .prepare(
            `SELECT source.id FROM ${table} source
          LEFT JOIN ${installed} target ON target.${foreignKey}=source.id
          WHERE (target.${foreignKey} IS NULL${table === "contents" ? " OR target.format_version<>2" : ""}) AND source.id>? ORDER BY source.id LIMIT 32`
          )
          .all(cursor) as { id: number }[];
        if (!rows.length) break;
        for (const { id } of rows) {
          cursor = id;
          const job = make(id);
          if (!seen.has(job.key)) {
            seen.add(job.key);
            yield job;
          }
        }
      }
    }
    for (const [id, message] of store.failures)
      yield {
        key: `cache:${id}`,
        run: async () => {
          throw new Error(message);
        },
      };
    const owners = db
      .prepare(`SELECT id,white_board_content_ids FROM white_boards
      WHERE NOT EXISTS (SELECT 1 FROM whiteboard_documents WHERE board_id=white_boards.id)`)
      .all() as { id: number; white_board_content_ids: string }[];
    for (const owner of owners)
      yield {
        key: `whiteboard-owner:${owner.id}`,
        run: async () => {
          current();
          const pages: unknown = JSON.parse(owner.white_board_content_ids);
          if (
            !Array.isArray(pages) ||
            !pages.length ||
            !pages.every(id => Number.isSafeInteger(id) && id > 0)
          )
            throw new Error("旧白板页面目录为空或无效，原记录已保留");
          await board(pages[0] as number).run();
          if (!db.prepare("SELECT 1 FROM whiteboard_documents WHERE board_id=?").get(owner.id))
            throw new Error("白板拥有者尚未完成转换，原页面已保留");
        },
      };
  }

  private finished(name: string, failures: LegacyUpgradeFailure[]) {
    const { store, state } = collaborationModule.documentMigration();
    try {
      const db = this.processing.get(name);
      let remaining:
        | { contents: number; pages: number; boards: number; operations: number }
        | undefined;
      if (db?.open && databaseModule.getDatabase(name) === db) {
        const count = (sql: string) => (db.prepare(sql).get() as { total: number }).total;
        remaining = {
          contents: count(
            "SELECT count(*) total FROM contents WHERE NOT EXISTS (SELECT 1 FROM content_documents WHERE content_id=contents.id AND format_version=2)"
          ),
          pages: count(
            "SELECT count(*) total FROM white_board_contents WHERE NOT EXISTS (SELECT 1 FROM whiteboard_document_pages WHERE content_id=white_board_contents.id)"
          ),
          boards: count(
            "SELECT count(*) total FROM white_boards WHERE NOT EXISTS (SELECT 1 FROM whiteboard_documents WHERE board_id=white_boards.id)"
          ),
          operations:
            state.pendingMigrations().filter(record => record.plan.workspaceId === name).length +
            state.preparations(name).length,
        };
        if (!failures.length && Object.values(remaining).some(count => count > 0))
          failures.push({ key: "remaining", message: "仍有旧数据或未完成回执，将自动续做" });
      }

      const prefix = `legacy-upgrade-issues:${name}:`;
      const notices = store.db
        .prepare("SELECT value FROM settings WHERE substr(key,1,?)=?")
        .all(prefix.length, prefix) as { value: string }[];
      failures = [
        ...new Map(
          [...notices.map(row => JSON.parse(row.value) as LegacyUpgradeFailure), ...failures].map(
            item => [item.key, item]
          )
        ).values(),
      ];
      store.set(`legacy-content-upgrade:${name}`, {
        checkedAt: Date.now(),
        complete:
          remaining !== undefined &&
          failures.length === 0 &&
          Object.values(remaining).every(count => count === 0),
        remaining,
        failures,
      });
    } catch (error) {
      failures.push({
        key: "report",
        message: error instanceof Error ? error.message : "升级记录保存失败",
      });
    }
    if (!failures.length) {
      this.notified.delete(name);
      return;
    }
    if (failures.some(failure => temporaryFailure(failure.message)) && !this.retries.has(name)) {
      const timer = setTimeout(() => {
        this.retries.delete(name);
        this.request(name);
      }, 60_000);
      timer.unref();
      this.retries.set(name, timer);
    }
    const actionable = failures.filter(failure => !temporaryFailure(failure.message));
    if (!actionable.length) return;
    const signature = JSON.stringify(actionable);
    if (this.notified.get(name) === signature) return;
    this.notified.set(name, signature);
    routeNotification(
      {
        id: `legacy-content-upgrade:${name}`,
        title: "部分内容需要处理",
        body: `资料库「${name}」有 ${actionable.length} 项未能自动升级，原始数据已保留。${actionable[0].message}`,
        actions: [{ label: "查看详情" }, { label: "重试" }],
      },
      {
        kind: "main",
        handlers: [
          async () => {
            const file = join(PathUtil.getAppDir(), "content-upgrade-errors.json");
            writeFileSync(
              `${file}.tmp`,
              JSON.stringify({ database: name, failures: actionable }, null, 2)
            );
            renameSync(`${file}.tmp`, file);
            await shell.openPath(file);
          },
          () => {
            this.notified.delete(name);
            this.request(name);
          },
        ],
      }
    );
  }

  async init() {
    // 先排空迁移，再让正文与白板冻结，避免切库与安装互相跨越。
    registerDurableDocuments({
      priority: -1,
      has: () => true,
      prepare: async scope => {
        const resume = await this.queue.pause();
        return {
          commit: () => {
            if (scope.reason === "database-change") {
              for (const name of this.libraries)
                if (
                  (!scope.databaseName || scope.databaseName === name) &&
                  !databaseModule.getDatabase(name)?.open
                )
                  this.libraries.delete(name);
            }
            if (scope.reason !== "quit") resume();
          },
          rollback: resume,
        };
      },
    });
    databaseModule.onDatabaseConnected((name, reason) => {
      if (reason !== "sync_upload_reconnect") this.request(name);
    });
    collaborationModule.onLegacyContent(name => this.request(name));
    for (const name of databaseModule.databases.keys()) this.request(name);
    const settings = JSON.parse(await settingModule.readSetting()) as {
      database?: { databases?: { name: string }[] };
    };
    for (const library of settings.database?.databases ?? []) {
      if (!library.name || basename(library.name) !== library.name) continue;
      this.libraries.add(library.name);
      this.request(library.name);
    }
  }
}
export default new LegacyContentUpgradeModule();
