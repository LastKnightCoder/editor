import { describe, expect, it } from "vitest";
import { normalizePermissionMode, requiresApproval } from "../mode";

describe("工具权限模式", () => {
  it("手动确认：写与执行都要确认，只读不要", () => {
    expect(requiresApproval("read", "manual")).toBe(false);
    expect(requiresApproval(undefined, "manual")).toBe(false);
    expect(requiresApproval("write", "manual")).toBe(true);
    expect(requiresApproval("execute", "manual")).toBe(true);
  });

  it("自动允许编辑：写直接执行，执行仍要确认", () => {
    expect(requiresApproval("write", "acceptEdits")).toBe(false);
    expect(requiresApproval("execute", "acceptEdits")).toBe(true);
  });

  it("跳过确认：都不问", () => {
    expect(requiresApproval("write", "bypass")).toBe(false);
    expect(requiresApproval("execute", "bypass")).toBe(false);
  });

  it("未知值回落到手动确认", () => {
    expect(normalizePermissionMode(undefined)).toBe("manual");
    expect(normalizePermissionMode("yolo")).toBe("manual");
    expect(normalizePermissionMode("bypass")).toBe("bypass");
  });
});
