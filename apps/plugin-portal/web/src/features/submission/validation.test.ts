import { describe, expect, it } from "vitest";
import { LIMITS, emptyListing, type Listing } from "../../../../contracts";
import {
  formatErrors,
  mapServerFields,
  precheckFile,
  submitChecklist,
  submitFieldErrors,
} from "./validation";

const complete: Listing = {
  ...emptyListing(),
  summary: "简介",
  description: "介绍",
  changelog: "首次发布",
  repository: "https://github.com/owner/repo",
  commit: "A".repeat(40),
  supportUrl: "https://github.com/owner/repo/issues",
  iconUploadId: "icon",
};

describe("资料校验", () => {
  it("空草稿可以保存，提交时才要求必填", () => {
    expect(formatErrors(emptyListing())).toEqual({});
    expect(Object.keys(submitFieldErrors(emptyListing()))).toHaveLength(6);
    expect(submitFieldErrors(complete)).toEqual({});
  });

  it("格式错误与超长在保存前提示", () => {
    const errors = formatErrors({
      ...emptyListing(),
      summary: "字".repeat(LIMITS.summary + 1),
      repository: "https://gitlab.com/owner/repo",
      commit: "abc123",
      supportUrl: "http://example.com",
    });
    expect(Object.keys(errors).sort()).toEqual(["commit", "repository", "summary", "supportUrl"]);
  });

  it("仅空白不算填写", () => {
    expect(submitFieldErrors({ ...complete, summary: "   " }).summary).toBe("必填");
  });

  it("服务端字段错误兼容 listing. 前缀", () => {
    expect(mapServerFields({ "listing.commit": "无效", summary: "太长", other: "忽略" })).toEqual({
      commit: "无效",
      summary: "太长",
    });
  });

  it("检查清单：未保存或仍在上传时不能提交", () => {
    const base = {
      listing: complete,
      hasPackage: true,
      packageReady: true,
      uploading: false,
      dirty: false,
    };
    expect(submitChecklist(base).every(item => item.ok)).toBe(true);
    expect(submitChecklist({ ...base, dirty: true }).find(item => !item.ok)?.key).toBe("saved");
    expect(submitChecklist({ ...base, uploading: true }).find(item => !item.ok)?.key).toBe(
      "uploads"
    );
    expect(
      submitChecklist({ ...base, listing: { ...complete, iconUploadId: null } }).find(
        item => !item.ok
      )?.key
    ).toBe("icon");
  });
});

describe("上传前预检", () => {
  it("插件包需要 .zip 且不超过 8 MiB", () => {
    expect(precheckFile("package", { name: "a.zip", size: 10, type: "" })).toBeNull();
    expect(precheckFile("package", { name: "a.tar.gz", size: 10, type: "" })).toMatch(/zip/);
    expect(precheckFile("package", { name: "a.zip", size: LIMITS.zipBytes + 1, type: "" })).toMatch(
      /不能超过/
    );
  });

  it("图片只接受 PNG/JPEG/WebP 且不超过 2 MiB", () => {
    expect(precheckFile("icon", { name: "a.png", size: 10, type: "image/png" })).toBeNull();
    expect(precheckFile("screenshot", { name: "a.gif", size: 10, type: "image/gif" })).toMatch(
      /PNG/
    );
    expect(
      precheckFile("screenshot", {
        name: "a.webp",
        size: LIMITS.imageBytes + 1,
        type: "image/webp",
      })
    ).toMatch(/不能超过/);
    expect(precheckFile("icon", { name: "a.png", size: 0, type: "image/png" })).toBe("文件为空");
  });
});
