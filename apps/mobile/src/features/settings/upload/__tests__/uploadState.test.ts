import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { afterAll } from "vitest";
import { storageMessages } from "../../storage/i18n";
import { uploadFailureText } from "../../../../services/uploadOutcome.i18n";
// 目的地卡状态：配置不完整优先，其次是当前位置的最近结果；别的位置的结果不算数。
import { describe, expect, it } from "vitest";
import { deriveDestinationState } from "../uploadState";

const now = Date.UTC(2026, 9, 23, 12, 0);

describe("deriveDestinationState", () => {
  it("云端服务配置不完整时提示完成配置", () => {
    expect(
      deriveDestinationState(
        {
          activeId: "s3",
          isLocal: false,
          configured: false,
          outcome: null,
          now,
        },
        language
      )
    ).toMatchObject({ tone: "warn", fixLabel: "完成配置" });
  });

  it("按失败类别给出修复入口，网络问题不给按钮", () => {
    const failure = (kind: "auth" | "location" | "network") =>
      deriveDestinationState(
        {
          activeId: "github",
          isLocal: false,
          configured: true,
          outcome: { ok: false, providerId: "github", at: now, kind, message: "原因" },
          now,
        },
        language
      ).fixLabel;
    expect(failure("auth")).toBe("检查账号");
    expect(failure("location")).toBe("检查存储位置");
    expect(failure("network")).toBeNull();
  });

  it("成功结果显示相对时间，本机用「保存」", () => {
    expect(
      deriveDestinationState(
        {
          activeId: "local",
          isLocal: true,
          configured: false,
          outcome: { ok: true, providerId: "local", at: now - 120_000 },
          now,
        },
        language
      ).text
    ).toBe("上次保存 2 分钟前 · 正常");
  });

  it("其他位置的结果不影响当前位置", () => {
    expect(
      deriveDestinationState(
        {
          activeId: "github",
          isLocal: false,
          configured: true,
          outcome: { ok: false, providerId: "s3", at: now, kind: "auth", message: "x" },
          now,
        },
        language
      )
    ).toMatchObject({ tone: "info", text: "还没有上传过图片" });
  });
});

const runtime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
const language = {
  locale: "zh-CN",
  t: runtime.get(storageMessages).t,
  failureText: uploadFailureText,
};
afterAll(() => runtime.dispose());
