import { describe, expect, it } from "vitest";
import { createMockApi, memoryStorage } from "./mockApi";

const setup = () =>
  createMockApi({ storage: memoryStorage(), timing: { latencyMs: 0, uploadMs: 5, verifyMs: 5 } });

/** 模拟适配器必须与协议行为一致，否则模拟下通过的界面在真实后端会出错 */
describe("模拟适配器的协议行为", () => {
  it("同一 clientRequestId 重试返回同一草稿", async () => {
    const { api } = setup();
    const first = await api.createSubmission("req-1");
    const again = await api.createSubmission("req-1");
    expect(again.id).toBe(first.id);
    expect((await api.createSubmission("req-2")).id).not.toBe(first.id);
  });

  it("旧 revision 保存返回 409，不覆盖", async () => {
    const { api } = setup();
    const draft = await api.getSubmission("sub_0004");
    const saved = await api.saveSubmission(draft.id, {
      revision: draft.revision,
      packageUploadId: null,
      listing: { ...draft.listing, summary: "A" },
    });
    expect(saved.revision).toBe(draft.revision + 1);
    await expect(
      api.saveSubmission(draft.id, {
        revision: draft.revision,
        packageUploadId: null,
        listing: { ...draft.listing, summary: "B" },
      })
    ).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect((await api.getSubmission(draft.id)).listing.summary).toBe("A");
  });

  it("「下一次保存冲突」开关模拟另一窗口先保存", async () => {
    const { api, controller } = setup();
    const draft = await api.getSubmission("sub_0003");
    controller.setFlags({ conflictNextSave: true });
    await expect(
      api.saveSubmission(draft.id, {
        revision: draft.revision,
        packageUploadId: draft.packageUploadId,
        listing: draft.listing,
      })
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await api.getSubmission(draft.id)).revision).toBe(draft.revision + 1);
  });

  it("草稿只能引用本人 ready 且类型匹配的上传", async () => {
    const { api } = setup();
    const draft = await api.getSubmission("sub_0004");
    await expect(
      api.saveSubmission(draft.id, {
        revision: draft.revision,
        packageUploadId: "upl_sample_icon_1",
        listing: draft.listing,
      })
    ).rejects.toMatchObject({ code: "UPLOAD_NOT_READY" });
  });

  it("提交后为待审核，重复提交返回原记录，待审内容冻结", async () => {
    const { api } = setup();
    const draft = await api.getSubmission("sub_0003");
    const submitted = await api.submitSubmission(draft.id, draft.revision);
    expect(submitted).toMatchObject({ status: "pending_review", submittedAt: expect.any(String) });
    expect(await api.submitSubmission(draft.id, draft.revision)).toEqual(submitted);
    await expect(
      api.saveSubmission(draft.id, {
        revision: submitted.revision,
        packageUploadId: submitted.packageUploadId,
        listing: submitted.listing,
      })
    ).rejects.toMatchObject({ code: "SUBMISSION_LOCKED" });
  });

  it("资料不全不能提交", async () => {
    const { api } = setup();
    const draft = await api.getSubmission("sub_0002");
    await expect(api.submitSubmission(draft.id, draft.revision)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_INPUT",
    });
  });

  it("提交失败场景：仓库未通过 / 响应丢失但服务端已提交", async () => {
    const { api, controller } = setup();
    const draft = await api.getSubmission("sub_0003");
    controller.setFlags({ submit: "repository" });
    await expect(api.submitSubmission(draft.id, draft.revision)).rejects.toMatchObject({
      code: "REPOSITORY_NOT_ALLOWED",
    });
    expect((await api.getSubmission(draft.id)).status).toBe("draft");
    controller.setFlags({ submit: "network" });
    await expect(api.submitSubmission(draft.id, draft.revision)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect((await api.getSubmission(draft.id)).status).toBe("pending_review");
  });

  it("其他人的或不存在的记录统一 404", async () => {
    const { api } = setup();
    await expect(api.getSubmission("sub_other")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("会话过期开关：下一次请求 401，之后保持未登录", async () => {
    const { api, controller } = setup();
    controller.setFlags({ expireNextRequest: true });
    await expect(api.listSubmissions(null)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(await api.getSession()).toEqual({ user: null, csrfToken: null });
    controller.signIn();
    expect((await api.getSession()).user?.login).toBeTruthy();
  });

  it("列表场景：空列表与加载失败", async () => {
    const { api, controller } = setup();
    expect((await api.listSubmissions(null)).items.length).toBeGreaterThan(0);
    controller.setFlags({ list: "empty" });
    expect(await api.listSubmissions(null)).toEqual({ items: [], nextCursor: null });
    controller.setFlags({ list: "error" });
    await expect(api.listSubmissions(null)).rejects.toMatchObject({ status: 503 });
  });

  it("数据持久在存储中：刷新（重建适配器）后草稿仍在", async () => {
    const storage = memoryStorage();
    const first = createMockApi({ storage, timing: { latencyMs: 0 } });
    const created = await first.api.createSubmission("req-x");
    const second = createMockApi({ storage, timing: { latencyMs: 0 } });
    expect((await second.api.getSubmission(created.id)).id).toBe(created.id);
  });
});
