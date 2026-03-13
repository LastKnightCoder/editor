import { describe, expect, it } from "vitest";
import { parseWeReadUploadSnapshot } from "../weread-upload";

describe("weread upload helpers", () => {
  it("应正确解析上传进度文本", () => {
    const snapshot = parseWeReadUploadSnapshot(`
      书籍 A 导入完成
      书籍 B 上传中
      书籍 C 导入失败
    `);

    expect(snapshot.successCount).toBe(1);
    expect(snapshot.processingCount).toBe(1);
    expect(snapshot.failureCount).toBe(1);
    expect(snapshot.readNowCount).toBe(0);
  });

  it("应识别立即阅读视为上传成功线索", () => {
    const snapshot = parseWeReadUploadSnapshot("导入完成 立即阅读");
    expect(snapshot.successCount).toBe(1);
    expect(snapshot.readNowCount).toBe(1);
  });
});
