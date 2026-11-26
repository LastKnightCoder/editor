import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { whiteboardChromeMessages } from "../i18n-chrome";
import { whiteboardSyncStatus, whiteboardStatusText } from "../collaboration";

it("切换展示语言保留暂停、重试和脱离共享语义，未知诊断保持原值", () => {
  const saved = {
    phase: "saved",
    frozen: false,
    pending: 0,
    revision: 1,
    projectedRevision: 1,
  } as const;
  const localeSource = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource });
  const { t } = runtime.get(whiteboardChromeMessages);
  const previous = whiteboardSyncStatus(saved, undefined, "publication");
  try {
    for (const locale of ["zh-CN", "zh-TW", "en-US"]) {
      localeSource.setLocale(locale);
      for (const pending of ["publication", "unshare"] as const) {
        const status = whiteboardSyncStatus(saved, undefined, pending);
        expect({ tone: status.tone, actions: status.actions }).toEqual({
          tone: "syncing",
          actions: undefined,
        });
      }
      const checking = whiteboardSyncStatus(saved, { phase: "checking", unsynced: false });
      expect(checking.tone).toBe("syncing");
      expect(whiteboardSyncStatus(saved, { phase: "local", unsynced: false }).tone).toBe("idle");
      const diagnostic = "服务器诊断: 原始消息";
      expect(
        whiteboardSyncStatus(saved, { phase: "waiting", unsynced: true, message: diagnostic })
      ).toMatchObject({ reason: diagnostic, tone: "syncing", actions: ["retry"] });
      for (const phase of ["rejected", "closed"] as const) {
        expect(whiteboardSyncStatus(saved, { phase, unsynced: true }).actions).toEqual(["detach"]);
      }
      expect(whiteboardSyncStatus(saved, { phase: "forbidden", unsynced: true }).actions).toEqual([
        "retry",
        "detach",
      ]);
      expect(whiteboardSyncStatus(saved, { phase: "synced", unsynced: true })).toMatchObject({
        tone: "syncing",
        transientSyncing: true,
      });
      expect(whiteboardSyncStatus(saved, { phase: "synced", unsynced: false }).tone).toBe("live");
    }
    expect(whiteboardSyncStatus(saved, undefined, "publication")).toEqual(previous);
    const diagnostic = "原始保存诊断 trace-42";
    const failed = whiteboardSyncStatus({ ...saved, error: diagnostic });
    expect(failed).toMatchObject({
      kind: "saveFailed",
      reason: diagnostic,
      actions: ["retry-save"],
    });
    expect(whiteboardStatusText(failed, t)).toContain(diagnostic);
  } finally {
    runtime.dispose();
  }
});
