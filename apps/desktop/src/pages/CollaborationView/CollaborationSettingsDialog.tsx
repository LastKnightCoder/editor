import { useEffect, useState } from "react";
import { App } from "antd";
import { Download, Upload } from "lucide-react";
import { invoke } from "@/electron";
import useCollaborationStore from "@/stores/useCollaborationStore";
import CustomModal from "@/components/CustomModal";

/** 协作设置：昵称、服务器地址与设备身份的导出/恢复。 */
export default function CollaborationSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const state = useCollaborationStore();
  const { message } = App.useApp();
  const [url, setUrl] = useState(state.serverUrl);
  const [nickname, setNickname] = useState(state.nickname);
  const [configuring, setConfiguring] = useState(false);
  useEffect(() => {
    if (open) {
      setUrl(state.serverUrl);
      setNickname(state.nickname);
    }
  }, [open, state.serverUrl, state.nickname]);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };
  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      title="协作设置"
      subtitle={state.deviceId ? `设备标识 ${state.deviceId.slice(0, 8)}…` : undefined}
      okText="保存"
      confirmLoading={configuring}
      okButtonProps={{ disabled: !url.trim() || !nickname.trim() }}
      onOk={async () => {
        setConfiguring(true);
        try {
          await invoke("collaboration:configure", { serverUrl: url.trim(), nickname });
          onClose();
        } catch (error) {
          message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
          setConfiguring(false);
        }
      }}
    >
      <div className="flex flex-col gap-4 py-1">
        <label className="text-text-2 flex flex-col gap-1.5 text-xs">
          <span>昵称</span>
          <input
            value={nickname}
            maxLength={40}
            placeholder="展示给协作者的名称"
            className="border-border-1 bg-bg-input text-text-1 h-9 rounded-[10px] border px-3 text-[13px] outline-none transition duration-150 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)]"
            onChange={event => setNickname(event.target.value)}
          />
        </label>
        <label className="text-text-2 flex flex-col gap-1.5 text-xs">
          <span>服务器地址</span>
          <input
            value={url}
            placeholder="https://…"
            className="border-border-1 bg-bg-input text-text-1 h-9 rounded-[10px] border px-3 text-[13px] outline-none transition duration-150 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)]"
            onChange={event => setUrl(event.target.value)}
          />
          <small className="text-text-3 text-[11px] leading-relaxed">
            支持自托管 HTTPS 服务，本机调试可使用 localhost HTTP。
          </small>
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="border-border-1 text-text-2 hover:bg-hover inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border bg-transparent px-3 text-xs transition duration-150 hover:border-[var(--th-border-hover)]"
            onClick={() => run(() => invoke("collaboration:export-identity"))}
          >
            <Download size={14} />
            导出身份
          </button>
          <button
            type="button"
            className="border-border-1 text-text-2 hover:bg-hover inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border bg-transparent px-3 text-xs transition duration-150 hover:border-[var(--th-border-hover)]"
            onClick={() => run(() => invoke("collaboration:import-identity"))}
          >
            <Upload size={14} />
            恢复身份
          </button>
          <small className="text-text-3 basis-full text-[11px]">
            导出文件包含访问凭据，请妥善保管。
          </small>
        </div>
      </div>
    </CustomModal>
  );
}
