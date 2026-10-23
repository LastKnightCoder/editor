// 上传结果记录：错误分类决定设置页的修复入口；最近失败只被编辑器提示取走一次，超时即作废。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyUploadError,
  readUploadOutcome,
  recordUploadFailure,
  recordUploadSuccess,
  resetUploadOutcomeForTest,
  takeRecentUploadFailure,
} from "../uploadOutcome";

describe("uploadOutcome", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetUploadOutcomeForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["RESOURCE_CONFIG_MISSING:Github 资源存储配置不完整", "config"],
    ["RESOURCE_UPLOAD_FAILED:Github 上传返回异常状态 HTTP 403: Forbidden", "auth"],
    ["RESOURCE_UPLOAD_FAILED:S3 上传失败: service error HTTP 404", "location"],
    ["RESOURCE_UPLOAD_TIMEOUT: 资源上传超时（60 秒）", "network"],
    [
      "RESOURCE_UPLOAD_FAILED:Github 上传失败: error sending request: connection refused",
      "network",
    ],
    ["RESOURCE_WRITE_FAILED:写入本地资源文件失败", "local"],
    ["RESOURCE_UPLOAD_FAILED:HTTP 500 boom", "unknown"],
  ])("%s → %s", (raw, kind) => {
    expect(classifyUploadError(new Error(raw)).kind).toBe(kind);
  });

  it("结果写入本机并可读回，成功会清掉待取的失败", () => {
    recordUploadFailure("s3", new Error("RESOURCE_UPLOAD_FAILED:HTTP 401"));
    recordUploadSuccess("s3");
    expect(readUploadOutcome()).toMatchObject({ ok: true, providerId: "s3" });
    expect(takeRecentUploadFailure()).toBeNull();
    resetUploadOutcomeForTest();
    expect(readUploadOutcome()).toMatchObject({ ok: true, providerId: "s3" });
  });

  it("最近失败超过时间窗口后不再被取走", () => {
    vi.useFakeTimers();
    recordUploadFailure("github", new Error("RESOURCE_UPLOAD_FAILED:HTTP 401"));
    vi.advanceTimersByTime(5000);
    expect(takeRecentUploadFailure()).toBeNull();
  });
});
