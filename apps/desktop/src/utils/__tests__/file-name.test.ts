import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "../file-name";

describe("sanitizeFileName", () => {
  it("普通标题原样返回", () => {
    expect(sanitizeFileName("读书笔记 2026", "未命名文档")).toBe("读书笔记 2026");
  });

  it("文件系统禁用字符替换为下划线", () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j', "x")).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("删除控制字符（含 DEL），不留占位", () => {
    expect(sanitizeFileName("a\u0000b\u001Fc\u007Fd", "x")).toBe("abcd");
  });

  it("换行、制表等空白折叠为单个空格并去掉首尾空白", () => {
    expect(sanitizeFileName("  第一行\n\t第二行  ", "x")).toBe("第一行 第二行");
  });

  it("去掉末尾的点号与空格", () => {
    expect(sanitizeFileName("结尾有点. . .", "x")).toBe("结尾有点");
    expect(sanitizeFileName("v1.0 版本", "x")).toBe("v1.0 版本");
  });

  it("净化后为空时回落到调用方给的默认名", () => {
    expect(sanitizeFileName("", "未命名文档")).toBe("未命名文档");
    expect(sanitizeFileName("   ", "export")).toBe("export");
    expect(sanitizeFileName(undefined, "export")).toBe("export");
    expect(sanitizeFileName(null, "export")).toBe("export");
    expect(sanitizeFileName("..", "未命名文档")).toBe("未命名文档");
    expect(sanitizeFileName("\u0001\u0002", "未命名文档")).toBe("未命名文档");
  });
});
