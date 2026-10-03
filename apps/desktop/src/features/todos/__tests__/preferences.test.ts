import { beforeEach, describe, expect, it } from "vitest";
import { readSavedGroupFilter, saveGroupFilter } from "../preferences";

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
