/**
 * 局域网设备同步页签：一张纸自上而下——一句状态 + 一个主操作 → 设备 / 本机 → 留白隔开的「恢复」。
 * 按资料库开启：未登记时选角色（由本机协调 / 连接已有协调电脑），之后按 role 分到协调端或连接端视图。
 */

import { useState, type ReactNode } from "react";
import { Database, Link2, LoaderCircle, Network } from "lucide-react";
import { Button, Panel, Tag, toast } from "@tau/ui";
import { previewDevicePairCode } from "@tau/collaboration/src/device-sync/messages";
import {
  NOT_ALL_ONLINE,
  SCOPE_TEXT,
  useDeviceSyncModel,
  type DeviceSyncModel,
} from "./deviceSyncModel";
import { Failure, PasteField, StatusBand } from "./deviceSyncParts";
import { CoordinatorView } from "./DeviceSyncCoordinator";
import { ReplicaView } from "./DeviceSyncReplica";

export function DeviceSyncPanel() {
  const model = useDeviceSyncModel();
  const { status } = model;
  let body;
  // 首次配对才显示建立副本；连接端重新配对在自己的对话框里等待
  if (model.pair.isPending && status.data?.role !== "replica") body = <FirstSync />;
  else if (!status.data)
    body = status.error ? (
      <Failure error={status.error} />
    ) : (
      <p className="text-tau-meta text-ink-3">正在读取设备同步状态…</p>
    );
  else if (status.data.role === "replica")
    body = <ReplicaView model={model} status={status.data} />;
  else if (status.data.role === "coordinator")
    body = <CoordinatorView model={model} status={status.data} />;
  else body = <RoleChoice model={model} />;
  return (
    <Panel pad="none" className="rounded-tau-lg px-6 py-[22px]">
      {body}
    </Panel>
  );
}

function FirstSync() {
  return (
    <StatusBand
      tone="accent"
      icon={LoaderCircle}
      spinning
      title="正在建立本机副本"
      subtitle="从协调电脑下载资料库，资料较多时需要几分钟。现有资料库保持原样。"
    />
  );
}

/** 两条路并排：选角色不藏到下一步；协调端开启与连接端粘贴都在这一屏完成 */
function RoleChoice({ model }: { model: DeviceSyncModel }) {
  const [code, setCode] = useState("");
  const preview = code.trim() ? previewDevicePairCode(code) : undefined;
  const local =
    preview === null
      ? "PAIR"
      : preview && preview.expires < Date.now()
        ? "PAIR_EXPIRED"
        : undefined;
  const pairError = model.pair.error ?? (local ? `DEVICE_SYNC_${local}` : undefined);
  const busy = model.enable.isPending || model.pair.isPending;
  return (
    <>
      <Tag className="gap-1">
        <Database size={12} strokeWidth={1.75} aria-hidden />
        当前资料库 · {model.name}
      </Tag>
      <h2 className="text-tau-title-lg text-ink-1 mt-3 font-semibold">
        让这份资料库在你的设备之间自动同步
      </h2>
      <p className="text-tau-body text-ink-2 mt-1 max-w-[620px]">
        一台电脑负责协调，其他电脑和手机连接它。每台设备都能离线编辑，回到同一个局域网后自动补齐。
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <RoleTile icon={Network} title="由本机协调">
          <p>这台电脑资料最完整、平时常开着，就选它。开启后为每台设备生成一份配对信息。</p>
          <Failure error={model.enable.error} />
          <div className="mt-auto pt-1">
            <Button
              variant="secondary"
              loading={model.enable.isPending}
              loadingText="正在开启…"
              disabled={busy}
              onClick={() => model.enable.mutate()}
            >
              开启并协调
            </Button>
          </div>
        </RoleTile>
        <RoleTile icon={Link2} title="连接已有协调电脑">
          <label htmlFor="device-sync-paste">
            在协调电脑的「设置 → 同步 → 设备同步」点「添加设备」，复制配对信息粘贴到这里。
          </label>
          <PasteField
            id="device-sync-paste"
            value={code}
            invalid={Boolean(code.trim() && pairError)}
            onChange={value => {
              setCode(value);
              model.pair.reset();
            }}
          />
          {code.trim() && <Failure error={pairError} />}
          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-1">
            <Button
              variant="primary"
              disabled={!code.trim() || Boolean(local) || busy}
              onClick={() =>
                model.pair.mutate(code, {
                  onSuccess: () => {
                    setCode("");
                    toast.success("已配对，设备将自动补齐");
                  },
                })
              }
            >
              配对并建立本机副本
            </Button>
            <span className="text-tau-sm text-ink-3">
              首次配对会新建一份本机副本，现有资料库保持原样。
            </span>
          </div>
        </RoleTile>
      </div>
      <div className="text-tau-meta text-ink-2 mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-ink-1 mb-0.5 font-semibold">同步什么</div>
          {SCOPE_TEXT}
        </div>
        <div>
          <div className="text-ink-1 mb-0.5 font-semibold">先想好哪台电脑协调</div>
          一份资料库只由一台电脑协调，之后不能改由其他设备协调。{NOT_ALL_ONLINE}
        </div>
      </div>
    </>
  );
}

function RoleTile(props: { icon: typeof Network; title: string; children: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="border-line-1 rounded-tau-lg text-tau-meta text-ink-2 flex flex-col gap-2.5 border p-[18px]">
      <div className="flex items-center gap-2.5">
        <span className="bg-hover text-ink-2 grid size-9 flex-none place-items-center rounded-[11px]">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="text-tau-title text-ink-1 font-semibold">{props.title}</span>
      </div>
      {props.children}
    </div>
  );
}
