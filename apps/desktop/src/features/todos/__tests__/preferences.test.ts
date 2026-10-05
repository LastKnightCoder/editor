import { beforeEach, describe, expect, it } from "vitest";
import { readSavedGroupFilter, readSavedMode, saveGroupFilter, saveMode } from "../preferences";

beforeEach(() => {
  localStorage.clear();
});

describe("待办筛选偏好", () => {
  it("写入后可读回；显式回全部记空串", () => {
    saveGroupFilter("3");
    expect(readSavedGroupFilter()).toBe("3");
    saveGroupFilter("");
    expect(readSavedGroupFilter()).toBe("");
  });

  it("无记录或坏数据返回 null，不抛错", () => {
    expect(readSavedGroupFilter()).toBeNull();
    localStorage.setItem("tau-todos-preferences", "{bad json");
    expect(readSavedGroupFilter()).toBeNull();
    localStorage.setItem("tau-todos-preferences", JSON.stringify({ groupFilter: 3 }));
    expect(readSavedGroupFilter()).toBeNull();
  });
});

describe("待办分段方式偏好", () => {
  it("默认按日期；写入后可读回，且与项目筛选互不覆盖", () => {
    expect(readSavedMode()).toBe("date");
    saveGroupFilter("3");
    saveMode("group");
    expect(readSavedMode()).toBe("group");
    expect(readSavedGroupFilter()).toBe("3");
    saveGroupFilter("5");
    expect(readSavedMode()).toBe("group");
  });

  it("坏值回退按日期", () => {
    localStorage.setItem("tau-todos-preferences", JSON.stringify({ mode: "x" }));
    expect(readSavedMode()).toBe("date");
  });
});
