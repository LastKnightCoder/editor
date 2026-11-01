/**
 * 连接端：日常只有一句状态 +「立即补齐」，暂停与重新配对收进 ⋯；
 * 「下载协调电脑版本并覆盖本机」隔一段留白放在「恢复」区，点开确认一次。
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Ellipsis,
  Image as ImageIcon,
  Info,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, IconButton, Menu, toast } from "@tau/ui";
import { describeDeviceSyncError } from "@tau/collaboration/src/device-sync/messages";
import {
  formatSince,
  NOT_ALL_ONLINE,
  type DeviceSyncModel,
  type DeviceSyncStatus,
} from "./deviceSyncModel";
import {
  CopyDetail,
  Failure,
  PasteField,
  PreservedCopies,
  QuietRow,
  SectionHead,
  StatusBand,
} from "./deviceSyncParts";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const OVERWRITE_LOSES = [
  "未同步到协调电脑的本机修改",
  "待同步任务、草稿与缓存",
  "撤销记录；正在编辑的窗口会重新打开",
];

type ReplicaState = "paused" | "syncing" | "synced" | "offline" | "error";
const stateOf = (status: DeviceSyncStatus): ReplicaState =>
  !status.enabled
    ? "paused"
    : status.phase === "synced" || status.phase === "offline" || status.phase === "error"
      ? status.phase
      : "syncing";

export function ReplicaView({
  model,
  status,
}: {
  model: DeviceSyncModel;
  status: DeviceSyncStatus;
}) {
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const state = stateOf(status);
  const problem = status.error ? describeDeviceSyncError(status.error) : undefined;
  const since = formatSince(status.lastSync);
  const assets = status.pendingAssets;

  const more = (
    <Menu
      align="end"
      trigger={
        <IconButton aria-label="设备同步的更多操作">
          <Ellipsis {...ICON} />
        </IconButton>
      }
    >
      {state !== "paused" && (
        <Menu.Item icon={<Pause {...ICON} />} onSelect={() => model.pause.mutate()}>
          暂停自动连接
        </Menu.Item>
      )}
      <Menu.Item icon={<Link2 {...ICON} />} onSelect={() => setRepairOpen(true)}>
        重新粘贴配对信息
      </Menu.Item>
    </Menu>
  );
  const syncButton = (label: string) => (
    <Button
      variant="secondary"
      icon={RefreshCw}
      loading={model.sync.isPending}
      loadingText="正在补齐…"
      onClick={() => model.sync.mutate(undefined, { onSuccess: () => toast.success("已补齐") })}
    >
      {label}
    </Button>
  );

  let band;
  switch (state) {
    case "paused":
      band = (
        <StatusBand
          tone="idle"
          icon={Pause}
          title="已暂停自动连接"
          subtitle="本机照常编辑，修改都保存在这台电脑上；恢复后自动补齐。"
          actions={
            <>
              <Button
                variant="primary"
                icon={Play}
                loading={model.enable.isPending}
                loadingText="正在恢复…"
                onClick={() => model.enable.mutate()}
              >
                恢复自动连接
              </Button>
              {more}
            </>
          }
        />
      );
      break;
    case "syncing":
      band = (
        <StatusBand
          tone="accent"
          icon={LoaderCircle}
          spinning
          title={status.phase === "syncing" ? "正在补齐…" : "正在连接协调电脑…"}
          subtitle="合并协调电脑和本机的修改，正文都会保留。"
          actions={more}
        />
      );
      break;
    case "offline":
      band = (
        <StatusBand
          tone="warn"
          icon={WifiOff}
          title="暂时连不上协调电脑"
          subtitle={`本机照常阅读和编辑，修改已保存在这台电脑上，连上后自动补齐。${since ? `上次同步 ${since}。` : ""}`}
          actions={
            <>
              {syncButton("重试")}
              {more}
            </>
          }
        />
      );
      break;
    case "error":
      band = (
        <StatusBand
          tone="danger"
          icon={AlertTriangle}
          title="这次同步没有完成"
          subtitle="已保存的内容不受影响，可以继续编辑。Tau 会自动重试，间隔逐渐拉长到每分钟一次。"
          actions={
            <>
              {problem?.repair ? (
                <Button variant="primary" icon={Link2} onClick={() => setRepairOpen(true)}>
                  重新粘贴配对信息
                </Button>
              ) : (
                syncButton("重试")
              )}
              {more}
            </>
          }
        />
      );
      break;
    default:
      band = (
        <StatusBand
          tone="ok"
          icon={CheckCircle2}
          title={assets ? "正文已同步，图片还在下载" : "已与协调电脑同步"}
          subtitle={
            assets
              ? "图片稍后显示，不影响阅读和编辑；网络恢复后会继续下载。"
              : `${since ? `${since}补齐 · ` : ""}${NOT_ALL_ONLINE}`
          }
          actions={
            <>
              {syncButton("立即补齐")}
              {more}
            </>
          }
        />
      );
  }

  const canOverwrite = state === "synced" || state === "error";
  return (
    <>
      {band}
      {state === "error" && problem && (
        <div className="border-line-1 rounded-tau-md text-tau-meta text-ink-2 mt-3 flex items-center gap-3 border px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <b className="text-ink-1 font-semibold">{problem.title}</b>　{problem.hint}
          </span>
          <CopyDetail detail={problem.detail} />
        </div>
      )}
      {state === "offline" && (
        <div className="border-line-1 rounded-tau-md text-tau-meta text-ink-2 mt-3 border px-3 py-2.5">
          <b className="text-ink-1 font-semibold">可以检查</b>
          <ul className="mt-1 list-disc pl-4">
            <li>两台设备连着同一个局域网</li>
            <li>协调电脑上的 Tau 正在运行、没有暂停连接</li>
            <li>协调电脑换了网络地址时，重新粘贴一次配对信息</li>
          </ul>
        </div>
      )}
      <Failure
        error={
          model.enable.error ??
          model.pause.error ??
          (state === "synced" ? model.sync.error : undefined)
        }
        className="mt-3"
      />
      {assets > 0 && state !== "paused" && (
        <QuietRow icon={ImageIcon}>
          <span className="tabular-nums">{assets} 张图片待下载</span>
          <span className="text-ink-3"> · 自动重试，未下载完的文件不会被当作完成</span>
        </QuietRow>
      )}
      <PreservedCopies status={status} />
      <div className="mt-6 grid grid-cols-2 gap-[18px]">
        <Fact label="本机资料库" value={status.database} note="配对时新建的本机副本" />
        <Fact label="自动补齐" value="打开、唤醒、切回窗口时" note="失败后自动重试" />
      </div>
      <section className="mt-10">
        <SectionHead title="恢复" />
        <div className="border-line-1 rounded-tau-md flex items-center gap-5 border px-4 py-3.5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-tau-body text-ink-1 font-medium">下载协调电脑版本并覆盖本机</span>
            <span className="text-tau-meta text-ink-2">
              本机资料明显不对、想完全回到协调电脑的状态时才需要。会丢弃这台电脑上未同步的修改。
            </span>
            {!canOverwrite && (
              <span className="text-tau-meta text-ink-3 inline-flex items-center gap-1.5">
                <Info size={13} strokeWidth={1.75} aria-hidden />
                连上协调电脑后才能下载
              </span>
            )}
          </div>
          <Button
            variant="danger-soft"
            icon={Download}
            disabled={!canOverwrite}
            onClick={() => {
              model.download.reset();
              setOverwriteOpen(true);
            }}
          >
            下载并覆盖…
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={overwriteOpen}
        onOpenChange={setOverwriteOpen}
        title="下载协调电脑版本并覆盖本机"
        context={status.database}
        danger
        description={
          <div className="text-tau-body text-ink-2">
            <p>以协调电脑的版本为唯一基准，重新下载当前资料库。这台电脑上会丢弃：</p>
            <ul className="mt-2 grid gap-1.5">
              {OVERWRITE_LOSES.map(item => (
                <li key={item} className="flex items-start gap-2">
                  <X
                    size={14}
                    strokeWidth={1.75}
                    className="text-ink-3 mt-[3px] flex-none"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3">账号、配对信息和其他资料库不受影响。</p>
            {model.download.isPending && (
              <p className="text-ink-3 mt-2">正在下载、校验并替换，期间这份资料库暂停编辑。</p>
            )}
            {model.download.error && (
              <p role="alert" className="text-danger mt-2">
                下载没有完成：{describeDeviceSyncError(model.download.error).title}
                。当前资料库已恢复原样，可以继续编辑。
              </p>
            )}
          </div>
        }
        impact="原资料库会先备份到 backup 文件夹"
        confirmText={model.download.error ? "重试" : "下载并覆盖"}
        loadingText="下载中…"
        onConfirm={async () => {
          await model.download.mutateAsync();
          toast.success("已换成协调电脑的版本，原资料库已备份到 backup 文件夹");
        }}
      />
      <RepairDialog model={model} open={repairOpen} onOpenChange={setRepairOpen} />
    </>
  );
}

function Fact(props: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <div className="text-tau-sm text-ink-3">{props.label}</div>
      <div className="text-tau-body text-ink-1 mt-0.5 truncate font-medium">{props.value}</div>
      <div className="text-tau-sm text-ink-3">{props.note}</div>
    </div>
  );
}

function RepairDialog(props: {
  model: DeviceSyncModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pair } = props.model;
  const [code, setCode] = useState("");
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      locked={pair.isPending}
      onAfterClose={() => {
        setCode("");
        pair.reset();
      }}
      title="重新粘贴配对信息"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={pair.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            variant="primary"
            disabled={!code.trim()}
            loading={pair.isPending}
            loadingText="正在配对…"
            onClick={() =>
              pair.mutate(code, {
                onSuccess: () => {
                  props.onOpenChange(false);
                  toast.success("已重新配对，离线修改会自动补齐");
                },
              })
            }
          >
            重新配对
          </Button>
        </>
      }
    >
      <DialogBody>
        <p className="text-tau-body text-ink-2 mb-3">
          协调电脑换了网络地址，或者本机的配对被解除时使用。连接的还是同一份资料库，本机的离线修改都会保留。
        </p>
        <PasteField
          id="device-sync-repair"
          rows={3}
          value={code}
          invalid={Boolean(pair.error)}
          onChange={value => {
            setCode(value);
            pair.reset();
          }}
        />
        <Failure error={pair.error} className="mt-2" />
      </DialogBody>
    </Dialog>
  );
}
