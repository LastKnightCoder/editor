import { describe, expect, it } from "vitest";
import { emptyListing, type Submission } from "../../../../contracts";
import { memoryStorage } from "../../api/mock/mockApi";
import {
  createBackupStore,
  editorReducer,
  initEditor,
  isDirty,
  resolveBackup,
  valuesOf,
  type DraftValues,
  type EditorState,
  type LocalBackup,
} from "./draftState";

const draft = (
  revision: number,
  summary = "",
  status: Submission["status"] = "draft"
): Submission => ({
  id: "s1",
  revision,
  status,
  packageUploadId: null,
  manifest: null,
  listing: { ...emptyListing(), summary },
  repositoryId: null,
  createdAt: "2026-10-16T00:00:00Z",
  updatedAt: "2026-10-16T00:00:00Z",
  submittedAt: status === "pending_review" ? "2026-10-16T01:00:00Z" : null,
});

const withSummary =
  (summary: string) =>
  (values: DraftValues): DraftValues => ({
    ...values,
    listing: { ...values.listing, summary },
  });

const backup = (baseRevision: number, summary: string): LocalBackup => ({
  submissionId: "s1",
  baseRevision,
  values: valuesOf(draft(baseRevision, summary)),
  savedAt: "2026-10-16T00:30:00Z",
});

const edited = (state: EditorState, summary: string) =>
  editorReducer(state, { type: "edit", update: withSummary(summary) });

describe("刷新恢复草稿", () => {
  it("暂存基于当前版本：自动恢复并提示", () => {
    const state = initEditor(draft(2, "服务器"), backup(2, "本地"));
    expect(state.values.listing.summary).toBe("本地");
    expect(state.notice).toBe("restored");
    expect(isDirty(state)).toBe(true);
  });

  it("暂存基于旧版本：不自动覆盖，交给用户决定", () => {
    const server = draft(3, "服务器");
    const state = initEditor(server, backup(2, "本地"));
    expect(state.values.listing.summary).toBe("服务器");
    expect(state.staleBackup?.baseRevision).toBe(2);
    const loaded = editorReducer(state, { type: "load-stale-backup" });
    expect(loaded.values.listing.summary).toBe("本地");
    expect(loaded.base.revision).toBe(3);
  });

  it("与服务器一致或已提交的暂存直接作废", () => {
    expect(resolveBackup(draft(2, "同"), backup(2, "同"))).toEqual({ type: "none" });
    expect(resolveBackup(draft(4, "x", "pending_review"), backup(4, "本地"))).toEqual({
      type: "none",
    });
  });

  it("暂存存储容错：损坏内容或不匹配的 ID 读为空", () => {
    const storage = memoryStorage();
    const store = createBackupStore(() => storage);
    storage.setItem("tau-portal:unsaved:s1", "{bad json");
    expect(store.read("s1")).toBeNull();
    store.write({ ...backup(1, "x"), submissionId: "s2" });
    expect(store.read("s2")?.values.listing.summary).toBe("x");
    store.remove("s2");
    expect(store.read("s2")).toBeNull();
    expect(createBackupStore(() => null).read("s1")).toBeNull();
  });
});

describe("旧 revision 冲突", () => {
  it("无本地修改时静默采用服务器新版本", () => {
    const state = editorReducer(initEditor(draft(1), null), {
      type: "server",
      submission: draft(2, "新"),
    });
    expect(state.base.revision).toBe(2);
    expect(state.values.listing.summary).toBe("新");
    expect(state.remote).toBeNull();
  });

  it("有本地修改时不覆盖，记录待选择的新版本", () => {
    const dirty = edited(initEditor(draft(1), null), "我的");
    const state = editorReducer(dirty, { type: "server", submission: draft(2, "别人的") });
    expect(state.values.listing.summary).toBe("我的");
    expect(state.base.revision).toBe(1);
    expect(state.remote?.revision).toBe(2);
  });

  it("使用新版本：放弃本地修改", () => {
    const conflicted = editorReducer(edited(initEditor(draft(1), null), "我的"), {
      type: "server",
      submission: draft(2, "别人的"),
    });
    const state = editorReducer(conflicted, { type: "adopt-remote" });
    expect(state.values.listing.summary).toBe("别人的");
    expect(isDirty(state)).toBe(false);
  });

  it("保留我的修改：改为基于新版本，下次保存带新 revision", () => {
    const conflicted = editorReducer(edited(initEditor(draft(1), null), "我的"), {
      type: "server",
      submission: draft(2, "别人的"),
    });
    const state = editorReducer(conflicted, { type: "keep-mine" });
    expect(state.base.revision).toBe(2);
    expect(state.values.listing.summary).toBe("我的");
    expect(isDirty(state)).toBe(true);
  });

  it("保存期间继续输入的内容不会被保存结果冲掉", () => {
    const first = edited(initEditor(draft(1), null), "第一版");
    const sent = first.values;
    const typing = edited(first, "第二版");
    const state = editorReducer(typing, { type: "saved", sent, result: draft(2, "第一版") });
    expect(state.base.revision).toBe(2);
    expect(state.values.listing.summary).toBe("第二版");
    expect(isDirty(state)).toBe(true);
  });

  it("其他窗口已提交：转为待审内容", () => {
    const dirty = edited(initEditor(draft(1), null), "我的");
    const state = editorReducer(dirty, {
      type: "server",
      submission: draft(2, "已提交", "pending_review"),
    });
    expect(state.base.status).toBe("pending_review");
    expect(state.values.listing.summary).toBe("已提交");
  });
});
