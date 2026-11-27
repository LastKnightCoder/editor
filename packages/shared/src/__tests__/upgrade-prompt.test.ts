import { describe, expect, it } from "vitest";
import { parseUpgradeRequiredError } from "../upgrade-prompt";

describe("parseUpgradeRequiredError", () => {
  it("识别带时区日程写入被 SQLite 触发器拦截的错误", () => {
    const matched = parseUpgradeRequiredError(
      new Error(
        "Error invoking remote method: SQLITE_CONSTRAINT_TRIGGER: 该日程包含时区，请升级 Tau 后再修改时间。"
      )
    );
    expect(matched?.reason).toBe("calendar-timezone-write");
  });

  it("识别插件写入带时区日程被旧宿主拒绝的错误", () => {
    expect(parseUpgradeRequiredError("请升级 Tau 后再写入带时区的日程")?.reason).toBe(
      "calendar-timezone-write"
    );
  });

  it("识别开库数据模型不兼容错误", () => {
    expect(
      parseUpgradeRequiredError(
        new Error("DB_MODEL_INCOMPATIBLE: 数据库模型版本不受支持，请升级全部客户端")
      )?.reason
    ).toBe("db-model-incompatible");
  });

  it("识别结构化 UPGRADE_REQUIRED 前缀与最低版本号", () => {
    expect(
      parseUpgradeRequiredError("UPGRADE_REQUIRED:plugin-min-version@0.63.0: needs newer host")
    ).toEqual({
      reason: "plugin-min-version",
      minAppVersion: "0.63.0",
      rawMessage: "UPGRADE_REQUIRED:plugin-min-version@0.63.0: needs newer host",
    });
    expect(parseUpgradeRequiredError("UPGRADE_REQUIRED:future-unknown-feature")).toMatchObject({
      reason: "generic",
    });
  });

  it("普通错误不误判为需要升级", () => {
    expect(parseUpgradeRequiredError(new Error("网络连接超时"))).toBeNull();
    expect(parseUpgradeRequiredError(null)).toBeNull();
    expect(parseUpgradeRequiredError("")).toBeNull();
  });
});
