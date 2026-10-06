// 协作设置：身份卡置顶（设备即身份）+ 协作组。服务器固定为默认协作服务器，与桌面端一致。
// 本文件位于静态 bundle，因此协作运行时（yjs）只在保存动作中动态引入。
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

function deviceLabel(deviceId?: string) {
  if (!deviceId) return "未注册";
  if (deviceId.length <= 8) return deviceId;
  return `${deviceId.slice(0, 4)} ···· ${deviceId.slice(-3)}`;
}

export function CollaborationSection() {
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
      ? "已连接"
      : status === "starting"
        ? "连接中"
        : status === "error"
          ? "连接异常"
          : "未连接";
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
      toast.success("昵称已更新");
      setNicknameDraft(undefined);
    } catch (error) {
      app.presentError(error, "昵称更新失败");
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
              <span className="text-ink truncate text-[18px] font-extrabold">{nickname}</span>
              <button
                type="button"
                onClick={() => setNicknameDraft(nickname)}
                className="text-accent shrink-0 text-[11.5px] font-bold"
              >
                修改
              </button>
            </div>
            <div className="text-ink-3 mt-1 text-[11.5px]">设备 {deviceLabel(deviceId)}</div>
          </div>
        </div>
        <div className="border-line text-ink-2 mt-3.5 flex gap-2 border-t pt-3 text-[11.5px] leading-relaxed">
          这是协作者看到的你 · 无需注册账号，设备即身份
        </div>
      </div>

      <GroupLabel>协作</GroupLabel>
      <GroupCard>
        <GroupRow>
          <IconWifi />
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[14px] font-medium">连接状态</span>
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
          label="我的协作"
          value={
            sessions.length === 0
              ? "暂无房间"
              : `${sessions.length} 个房间${pendingCount > 0 ? ` · ${pendingCount} 待审批` : ""}`
          }
          onClick={() => navigator.push("collaborationCenter")}
        />
      </GroupCard>

      <GroupNote className="pt-2">与桌面端使用同一协作服务器 · 可跨端协作</GroupNote>

      <BottomSheet
        open={nicknameDraft !== undefined}
        title="修改昵称"
        onClose={() => setNicknameDraft(undefined)}
      >
        <FieldInput
          label="昵称 · 协作者看到的你"
          value={nicknameDraft ?? ""}
          onChange={setNicknameDraft}
          placeholder="1-40 个字符"
        />
        <div className="mt-4">
          <button
            type="button"
            disabled={busy || !(nicknameDraft ?? "").trim()}
            onClick={() => void saveNickname()}
            className="shadow-accent w-full rounded-full py-3 text-[15px] font-extrabold text-white disabled:opacity-50 disabled:shadow-none"
            style={{ backgroundImage: "var(--brand-grad)" }}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
