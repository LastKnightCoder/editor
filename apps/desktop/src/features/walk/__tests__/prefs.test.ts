import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WALK_PREFS, readWalkPrefs, saveWalkPrefs } from "../prefs";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("漫步偏好", () => {
  it("默认：全部 5 种 + 久未见", () => {
    expect(readWalkPrefs()).toEqual({
      kinds: ["card", "article", "diary-moment", "project-item", "pdf-annotation"],
      bias: "stale",
    });
  });

  it("保存后读回；解析失败 / 非对象回默认", () => {
    saveWalkPrefs({ kinds: ["card", "article"], bias: "on-this-day" });
    expect(readWalkPrefs()).toEqual({ kinds: ["card", "article"], bias: "on-this-day" });

    window.localStorage.setItem("walk:prefs", "{broken json");
    expect(readWalkPrefs()).toEqual(DEFAULT_WALK_PREFS);
    window.localStorage.setItem("walk:prefs", "42");
    expect(readWalkPrefs()).toEqual(DEFAULT_WALK_PREFS);
  });

  it("kinds 过滤非法值；空表回默认（至少保留 1 种），bias 非法回 stale", () => {
    window.localStorage.setItem(
      "walk:prefs",
      JSON.stringify({ kinds: ["card", "not-a-kind", 3], bias: "random" })
    );
    expect(readWalkPrefs()).toEqual({ kinds: ["card"], bias: "random" });

    window.localStorage.setItem("walk:prefs", JSON.stringify({ kinds: [], bias: "stale" }));
    expect(readWalkPrefs().kinds).toEqual(DEFAULT_WALK_PREFS.kinds);

    window.localStorage.setItem(
      "walk:prefs",
      JSON.stringify({ kinds: ["diary-moment"], bias: "whatever" })
    );
    expect(readWalkPrefs()).toEqual({ kinds: ["diary-moment"], bias: "stale" });
  });
});
