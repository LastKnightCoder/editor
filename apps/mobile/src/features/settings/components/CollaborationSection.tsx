// 协作设置（设计稿 06 方案 B）：身份卡置顶（设备即身份）+ 服务器组 + 协作组。
// 本文件位于静态 bundle，因此协作运行时（yjs）只在保存动作中动态引入。
import { useState } from "react";
import { DEFAULT_COLLABORATION_URL, normalizeServerUrl } from "@tau/collaboration/src/protocol";
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
  IconCloud,
  LetterTile,
  ListItem,
  StatusDot,
  SwitchButton,
} from "./ui";

/** 前置校验直接复用共享包规则（与 Rust 侧 normalize_server_url 对齐，见 protocol.ts） */
function validateServerUrl(value: string): string | undefined {
  try {
    normalizeServerUrl(value.trim());
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "地址格式不正确";
  }
}

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

  const serverUrl = setting?.collaboration?.serverUrl || DEFAULT_COLLABORATION_URL;
  const nickname = setting?.collaboration?.nickname || "Tau 用户";
  const enabled = setting?.collaboration?.enable !== false;

  const [nicknameDraft, setNicknameDraft] = useState<string>();
  const [serverDraft, setServerDraft] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useCollaborationRuntime();

  const statusText =
    status === "ready"
      ? "已连接"
      : status === "starting"
        ? "连接中"
        : status === "error"
          ? "连接异常"
          : '未启用';
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

  const saveServer = () => {
    const value = (serverDraft ?? "").trim();
    const invalid = validateServerUrl(value);
    if (invalid) {
      setServerError(invalid);
      return;
    }
    updateSetting(
      prev => ({
        ...prev,
        collaboration: { ...(prev.collaboration ?? {}), serverUrl: value.replace(/\/+$/, "") },
      }),
      { persist: true }
    );
    toast.success("已切换协作服务器");
    setServerDraft(undefined);
    setServerError(undefined);
  };

  const toggleEnabled = () => {
    updateSetting(
      prev => ({
        ...prev,
        collaboration: { ...(prev.collaboration ?? {}), enable: !enabled },
      }),
      { persist: true }
    );
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

      <GroupLabel>协作服务器</GroupLabel>
      <GroupCard>
        <ListItem
          icon={<IconCloud />}
          label="服务器地址"
          value={serverUrl.replace(/^https?:\/\//, "")}
          onClick={() => {
            setServerDraft(serverUrl);
            setServerError(undefined);
          }}
        />
        <GroupRow>
          <LetterTile letter="连" className="bg-sage-soft text-sage" />
          <span className="text-ink flex-1 text-[14px] font-medium">连接状态</span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <StatusDot tone={statusTone} />
            {statusText}
          </span>
        </GroupRow>
        <GroupRow>
          <LetterTile letter="钥" className="bg-butter-soft text-butter" />
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[14px] font-medium">身份导入 / 导出</span>
            <span className="text-ink-3 block text-[11.5px]">跨设备迁移协作身份（含密钥）</span>
          </span>
          <span className="bg-butter-soft text-butter shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold">
            即将
          </span>
        </GroupRow>
      </GroupCard>

      <GroupLabel>协作</GroupLabel>
      <GroupCard>
        <ListItem
          icon={<LetterTile letter="协" className="bg-accent-soft text-accent" />}
          label="我的协作"
          value={
            sessions.length === 0
              ? "暂无房间"
              : `${sessions.length} 个房间${pendingCount > 0 ? ` · ${pendingCount} 待审批` : ""}`
          }
          onClick={() => navigator.push("collaborationCenter")}
        />
        <GroupRow>
          <LetterTile letter="启" className="bg-rose-soft text-rose" />
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[14px] font-medium">启用协作模块</span>
            <span className="text-ink-3 block text-[11.5px]">关闭后停止连接协作服务器</span>
          </span>
          <SwitchButton checked={enabled} onChange={toggleEnabled} />
        </GroupRow>
      </GroupCard>

      <GroupNote className="pt-2">与桌面端使用相同协议 · 同一服务器可跨端协作</GroupNote>

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

      <BottomSheet
        open={serverDraft !== undefined}
        title="协作服务器"
        onClose={() => {
          setServerDraft(undefined);
          setServerError(undefined);
        }}
      >
        <FieldInput
          label="服务器地址 · 仅支持 HTTPS"
          value={serverDraft ?? ""}
          onChange={value => {
            setServerDraft(value);
            setServerError(undefined);
          }}
          placeholder="https://collab.example.com"
        />
        {serverError ? (
          <p className="text-rose mt-2 text-[12px] leading-relaxed">{serverError}</p>
        ) : (
          <p className="text-ink-3 mt-2 text-[11.5px] leading-relaxed">
            切换服务器后，身份与房间按服务器隔离
          </p>
        )}
        <div className="mt-4">
          <button
            type="button"
            disabled={!(serverDraft ?? "").trim()}
            onClick={saveServer}
            className="shadow-accent w-full rounded-full py-3 text-[15px] font-extrabold text-white disabled:opacity-50 disabled:shadow-none"
            style={{ backgroundImage: "var(--brand-grad)" }}
          >
            保存并重连
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
