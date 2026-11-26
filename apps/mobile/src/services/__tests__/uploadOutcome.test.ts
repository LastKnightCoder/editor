// 上传结果记录：错误分类决定设置页的修复入口；最近失败只被编辑器提示取走一次，超时即作废。
import { mobileLocaleSource } from "../i18n";
import { uploadFailureText } from "../uploadOutcome.i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyUploadError,
  readUploadOutcome,
  recordUploadFailure,
  recordUploadSuccess,
  resetUploadOutcomeForTest,
  takeRecentUploadFailure,
  subscribeUploadOutcome,
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

it("上传诊断保留原码与原文，换语和历史读取不改写记录或重复发布", () => {
  const original = mobileLocaleSource.getSnapshot();
  const changed = vi.fn();
  const unsubscribe = subscribeUploadOutcome(changed);
  try {
    recordUploadFailure(
      "auth-provider",
      new Error("RESOURCE_UPLOAD_FAILED:HTTP 403 server detail §7")
    );
    const failure = readUploadOutcome();
    expect(failure).toMatchObject({
      ok: false,
      kind: "auth",
      code: "RESOURCE_UPLOAD_FAILED",
      message: "HTTP 403 server detail §7",
    });
    const stored = window.localStorage.getItem("tau.mobile.lastUpload");
    const publications = changed.mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      mobileLocaleSource.setLocale(locale);
      uploadFailureText(failure);
      expect(readUploadOutcome()).toBe(failure);
      expect(window.localStorage.getItem("tau.mobile.lastUpload")).toBe(stored);
      expect(changed).toHaveBeenCalledTimes(publications);
    }
    expect(takeRecentUploadFailure()).toBe(failure);
    expect(takeRecentUploadFailure()).toBeNull();
    // 旧记录没有错误码，按已有类别展示，不改写历史数据。
    const historical = {
      ok: false,
      providerId: "old-provider",
      at: 1,
      kind: "auth",
      message: "历史原因",
    };
    window.localStorage.setItem("tau.mobile.lastUpload", JSON.stringify(historical));
    resetUploadOutcomeForTest();
    expect(readUploadOutcome()).toEqual(historical);
    uploadFailureText(readUploadOutcome());
    expect(window.localStorage.getItem("tau.mobile.lastUpload")).toBe(JSON.stringify(historical));
    expect(changed).toHaveBeenCalledTimes(publications);
  } finally {
    unsubscribe();
    mobileLocaleSource.setLocale(original);
  }
});
