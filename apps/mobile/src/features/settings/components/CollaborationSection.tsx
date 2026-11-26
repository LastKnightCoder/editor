// 协作设置：身份卡置顶（设备即身份）+ 协作组。服务器固定为默认协作服务器，与桌面端一致。
// 本文件位于静态 bundle，因此协作运行时（yjs）只在保存动作中动态引入。
import {
  collaborationSettingsTranslator,
  useCollaborationSettingsI18n,
} from "../collaboration/i18n";
import { useState } from "react";
import { useAppContext } from "../../../app/AppContext";
import { BottomSheet } from "../../../components/BottomSheet";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useNavigator } from "../../../router";
import { Avatar } from "../../collaboration/components/CollaborationUI";
import { useCollaborationRuntime } from "../../collaboration/hooks/useCollaborationRuntime";
import { useCollaborationStore } from "../../collaboration/core/store";
import {
  FieldInput,
  GroupCard,
  GroupNote,
  GroupRow,
  IconUsers,
  IconWifi,
  ListItem,
  StatusDot,
} from "./ui";

function deviceLabel(deviceId: string) {
  if (deviceId.length <= 8) return deviceId;
  return `${deviceId.slice(0, 4)} ···· ${deviceId.slice(-3)}`;
}

export function CollaborationSection() {
  const { t } = useCollaborationSettingsI18n();
  const app = useAppContext();
  const navigator = useNavigator();
  const setting = app.syncSettings.safeSetting;
  const updateSetting = app.syncSettings.updateSetting;
  const deviceId = useCollaborationStore(state => state.deviceId);
  const status = useCollaborationStore(state => state.status);
  const sessions = useCollaborationStore(state => state.sessions);
  const requests = useCollaborationStore(state => state.requests);
  const error = useCollaborationStore(state => state.error);

  const nickname = setting?.collaboration?.nickname || "Tau 用户";

  const [nicknameDraft, setNicknameDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  useCollaborationRuntime();

  const statusText =
    status === "ready"
      ? t("status.ready")
      : status === "starting"
        ? t("status.starting")
        : status === "error"
          ? t("status.error")
          : t("status.offline");
  const statusTone = status === "ready" ? "ok" : status === "error" ? "warn" : "idle";

  const saveNickname = async () => {
    const value = (nicknameDraft ?? "").trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      // 先同步服务器再落盘，避免本地与服务端昵称不一致
      const { collaborationManager } = await import("../../collaboration/core/manager");
      await collaborationManager.updateNickname(value);
      updateSetting(
        prev => ({
          ...prev,
          collaboration: { ...(prev.collaboration ?? {}), nickname: value },
        }),
        { persist: true }
      );
      toast.success(collaborationSettingsTranslator.t("nickname.saved"));
      setNicknameDraft(undefined);
    } catch (error) {
      app.presentError(error, collaborationSettingsTranslator.t("nickname.failed"));
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = requests.length;

  return (
    <div className="space-y-1 pb-6">
      {/* 身份卡：无账号体系的核心概念——设备即身份 */}
      {/* 外层滚动容器已有 px-4，此处不可再加 mx，否则比下方 GroupCard 窄 32px */}
      <div className="bg-surface shadow-card rounded-[24px] p-5">
        <div className="flex items-center gap-3.5">
          <Avatar id={deviceId ?? "local"} name={nickname} size="lg" online={status === "ready"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-ink-1 truncate text-[18px] font-extrabold">{nickname}</span>
              <button
                type="button"
                onClick={() => setNicknameDraft(nickname)}
                className="text-accent shrink-0 text-[11.5px] font-bold"
              >
                {t("edit")}
              </button>
            </div>
            <div className="text-ink-3 mt-1 text-[11.5px]">
              {t("device", { id: deviceId ? deviceLabel(deviceId) : t("device.unregistered") })}
            </div>
          </div>
        </div>
        <div className="border-line-1 text-ink-2 mt-3.5 flex gap-2 border-t pt-3 text-[11.5px] leading-relaxed">
          {t("identity.hint")}
        </div>
      </div>

      <GroupLabel>{t("title")}</GroupLabel>
      <GroupCard>
        <GroupRow>
          <IconWifi />
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14px] font-medium">{t("connection")}</span>
            {status === "error" && error ? (
              <span className="text-ink-3 block truncate text-[11.5px]">{error}</span>
            ) : null}
          </span>
          <span className="text-ink-2 flex shrink-0 items-center gap-1.5 text-[12.5px]">
            <StatusDot tone={statusTone} />
            {statusText}
          </span>
        </GroupRow>
        <ListItem
          icon={<IconUsers />}
          label={t("rooms.title")}
          value={
            sessions.length === 0
              ? t("rooms.empty")
              : t("rooms.count", {
                  count: sessions.length,
                  pending: pendingCount > 0 ? t("rooms.pending", { count: pendingCount }) : "",
                })
          }
          onClick={() => navigator.push("collaborationCenter")}
        />
      </GroupCard>

      <GroupNote className="pt-2">{t("server.hint")}</GroupNote>

      <BottomSheet
        open={nicknameDraft !== undefined}
        title={t("nickname.title")}
        onClose={() => setNicknameDraft(undefined)}
      >
        <FieldInput
          label={t("nickname.label")}
          value={nicknameDraft ?? ""}
          onChange={setNicknameDraft}
          placeholder={t("nickname.placeholder")}
        />
        <div className="mt-4">
          <button
            type="button"
            disabled={busy || !(nicknameDraft ?? "").trim()}
            onClick={() => void saveNickname()}
            className="shadow-lift text-ink-inverse w-full rounded-full py-3 text-[15px] font-extrabold disabled:opacity-50 disabled:shadow-none"
            style={{ background: "var(--tau-accent)" }}
          >
            {busy ? t("saving") : t("save")}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
