import type { Listing, Submission } from "../../../../contracts";
import { FIELD_LABELS, type TextField } from "./validation";

/** 作者可编辑的草稿内容，对应 SaveSubmission 去掉 revision */
export interface DraftValues {
  packageUploadId: string | null;
  listing: Listing;
}

export const valuesOf = (submission: Submission): DraftValues => ({
  packageUploadId: submission.packageUploadId,
  listing: submission.listing,
});

const TEXT_FIELDS = Object.keys(FIELD_LABELS) as TextField[];

/** 与另一份内容相比改动了哪些项（用于冲突与恢复提示） */
export function changedFields(a: DraftValues, b: DraftValues): string[] {
  const changed: string[] = [];
  if (a.packageUploadId !== b.packageUploadId) changed.push("插件包");
  if (a.listing.iconUploadId !== b.listing.iconUploadId) changed.push("图标");
  if (a.listing.screenshotUploadIds.join() !== b.listing.screenshotUploadIds.join())
    changed.push("截图");
  for (const field of TEXT_FIELDS) {
    if (a.listing[field] !== b.listing[field]) changed.push(FIELD_LABELS[field]);
  }
  return changed;
}

export const sameValues = (a: DraftValues, b: DraftValues) => changedFields(a, b).length === 0;

/* ---------- 本机暂存：会话过期、刷新、关闭标签后找回未保存的修改 ---------- */

export interface LocalBackup {
  submissionId: string;
  baseRevision: number;
  values: DraftValues;
  savedAt: string;
}

export interface BackupStore {
  read(submissionId: string): LocalBackup | null;
  write(backup: LocalBackup): void;
  remove(submissionId: string): void;
}

const backupKey = (submissionId: string) => `tau-portal:unsaved:${submissionId}`;

function isBackup(value: unknown, submissionId: string): value is LocalBackup {
  const backup = value as LocalBackup | null;
  return (
    !!backup &&
    backup.submissionId === submissionId &&
    typeof backup.baseRevision === "number" &&
    !!backup.values?.listing &&
    Array.isArray(backup.values.listing.screenshotUploadIds)
  );
}

export function createBackupStore(
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null
): BackupStore {
  const safe = <T>(run: (store: NonNullable<ReturnType<typeof storage>>) => T, fallback: T) => {
    try {
      const store = storage();
      return store ? run(store) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    read: submissionId =>
      safe(store => {
        const value: unknown = JSON.parse(store.getItem(backupKey(submissionId)) ?? "null");
        return isBackup(value, submissionId) ? value : null;
      }, null),
    write: backup =>
      safe(
        store => store.setItem(backupKey(backup.submissionId), JSON.stringify(backup)),
        undefined
      ),
    remove: submissionId => safe(store => store.removeItem(backupKey(submissionId)), undefined),
  };
}

export type BackupResolution =
  | { type: "none" }
  /** 暂存基于当前版本：直接恢复并提示 */
  | { type: "restore"; values: DraftValues }
  /** 暂存基于旧版本：服务器已有更新，交给用户决定，不自动覆盖 */
  | { type: "stale"; backup: LocalBackup };

export function resolveBackup(server: Submission, backup: LocalBackup | null): BackupResolution {
  if (!backup || server.status !== "draft") return { type: "none" };
  if (sameValues(backup.values, valuesOf(server))) return { type: "none" };
  if (backup.baseRevision === server.revision) return { type: "restore", values: backup.values };
  return { type: "stale", backup };
}

/* ---------- 编辑器状态 ---------- */

export type EditorNotice = "restored" | null;

export interface EditorState {
  /** 当前修改所基于的服务器版本（保存时的 revision 取自这里） */
  base: Submission;
  values: DraftValues;
  /** 有未保存修改时到达的更新版本：等待用户选择，不自动覆盖 */
  remote: Submission | null;
  staleBackup: LocalBackup | null;
  notice: EditorNotice;
}

export type EditorAction =
  | { type: "edit"; update: (values: DraftValues) => DraftValues }
  | { type: "server"; submission: Submission }
  | { type: "saved"; sent: DraftValues; result: Submission }
  /** 放弃本地修改，采用服务器版本 */
  | { type: "adopt-remote" }
  /** 保留本地修改，改为基于服务器最新版本（下一次保存将覆盖它） */
  | { type: "keep-mine" }
  | { type: "load-stale-backup" }
  | { type: "dismiss-stale-backup" }
  | { type: "discard-local" }
  | { type: "dismiss-notice" };

export const isDirty = (state: EditorState) => !sameValues(state.values, valuesOf(state.base));

export function initEditor(server: Submission, backup: LocalBackup | null): EditorState {
  const resolution = resolveBackup(server, backup);
  return {
    base: server,
    values: resolution.type === "restore" ? resolution.values : valuesOf(server),
    remote: null,
    staleBackup: resolution.type === "stale" ? resolution.backup : null,
    notice: resolution.type === "restore" ? "restored" : null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "edit":
      return { ...state, values: action.update(state.values) };
    case "server": {
      const server = action.submission;
      if (server.revision === state.base.revision && server.status === state.base.status)
        return state;
      if (server.status !== "draft") {
        // 已提交：待审内容冻结，本地修改不再适用
        return {
          base: server,
          values: valuesOf(server),
          remote: null,
          staleBackup: null,
          notice: null,
        };
      }
      if (server.revision < state.base.revision) return state;
      if (!isDirty(state))
        return { ...state, base: server, values: valuesOf(server), remote: null };
      return { ...state, remote: server };
    }
    case "saved": {
      const { sent, result } = action;
      // 保存期间继续输入的内容保留为新的未保存修改
      const values = sameValues(state.values, sent) ? valuesOf(result) : state.values;
      return { ...state, base: result, values, remote: null, notice: null };
    }
    case "adopt-remote":
      if (!state.remote) return state;
      return { ...state, base: state.remote, values: valuesOf(state.remote), remote: null };
    case "keep-mine":
      if (!state.remote) return state;
      return { ...state, base: state.remote, remote: null };
    case "load-stale-backup":
      if (!state.staleBackup) return state;
      return { ...state, values: state.staleBackup.values, staleBackup: null };
    case "dismiss-stale-backup":
      return { ...state, staleBackup: null };
    case "discard-local":
      return { ...state, values: valuesOf(state.base), notice: null };
    case "dismiss-notice":
      return { ...state, notice: null };
  }
}
