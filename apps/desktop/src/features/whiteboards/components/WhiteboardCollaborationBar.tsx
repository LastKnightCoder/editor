/**
 * 白板画布顶部的状态行：本机保存与远端同步合成一行；共享入口（WhiteboardShareEntry）在右下状态栏。
 *
 * 未共享：「共享」打开说明对话框，确认后走主进程首次发布（暂停编辑 → 净化候选 → 服务端回执 →
 * 本机安装），结果未知时凭原操作续做或取消，不另建房间。已共享：成员与协作码沿用正文协作面板。
 * 远端换代时只提供「采用新版本」，本机未同步的改动留在原日志，不重投到新版本。
 */

import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import * as Y from "yjs";
import { ArrowRight, KeyRound, Layers, Link2, LogOut, Share2, Users, VideoOff } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, Popover, toast } from "@tau/ui";
import { WhiteboardModel } from "@tau/collaboration";
import { useStableStatus } from "@tau/collaboration/src/view";
import {
  prepareWhiteboardVersionUpgrade,
  type WhiteboardContractCatalog,
} from "@tau/whiteboard/collaboration";
import { useQueryClient } from "@tanstack/react-query";
import {
  adoptWhiteboardEpoch,
  cancelWhiteboardPublication,
  finishWhiteboardMigration,
  prepareWhiteboardMigration,
  readPendingWhiteboardUpgrade,
  readWhiteboardMigrationSource,
  resumeWhiteboardPublication,
  unshareWhiteboard,
} from "@/commands/whiteboard-document";
import type { WhiteboardShareStatus } from "@/types/whiteboard-document";
import { AvatarStack, SharePanel, StatusDot } from "@/components/CollaborationUI";
import { othersSummary } from "@/components/CollaborationUI/model";
import type { WhiteboardDocumentClient } from "@/services/whiteboard-documents/client";
import { whiteboardRemoteSync } from "@/services/whiteboard-documents/registry";
import { whiteboardShareStatusKey } from "@/services/whiteboard-documents/keys";
import { publishWhiteboardClient } from "@/services/whiteboard-documents/share";
import {
  remoteFailureText,
  type WhiteboardRemoteState,
} from "@/services/whiteboard-documents/remote";
import { openPage } from "@/services/page-navigation";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { useWhiteboardShareStatus } from "../queries";
import {
  upgradableElementIds,
  whiteboardSession,
  whiteboardSyncStatus,
  type WhiteboardPendingKind,
} from "../collaboration";

const idle = () => () => {};
const none = (): WhiteboardRemoteState | undefined => undefined;

/** 已绑定共享房间时订阅远端同步状态；未共享返回 undefined。 */
function useWhiteboardRemote(client: WhiteboardDocumentClient) {
  const remoteSync = whiteboardRemoteSync(client);
  const remote = useSyncExternalStore(
    remoteSync ? remoteSync.subscribe : idle,
    remoteSync ? remoteSync.getSnapshot : none,
    remoteSync ? remoteSync.getSnapshot : none
  );
  return { remoteSync, remote };
}

export function WhiteboardCollaborationBar({
  client,
  documentId,
  collaboration,
  catalog,
}: {
  client: WhiteboardDocumentClient;
  documentId: string;
  /** 只有白板页面提供插件数据升级；创作模式等嵌入画布只显示保存状态。 */
  collaboration?: boolean;
  /** 已安装插件的版本目录，用于发现并转换历史版本元素。 */
  catalog?: WhiteboardContractCatalog;
}) {
  const local = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const { remoteSync, remote } = useWhiteboardRemote(client);
  const share = useWhiteboardShareStatus(documentId);
  const pending = pendingKind(share.data);
  const status = whiteboardSyncStatus(local, remote, pending);
  const shown = useStableStatus(status) ?? status;
  const [confirming, setConfirming] = useState<ConfirmKind>();
  const databaseName = client.target.databaseName;
  const actions = status.actions ?? [];
  const binding = share.data?.binding ?? null;
  // 只在本机没有未保存改动时计算可升级元素，避免每次输入都遍历整板。
  const upgradable = useMemo(
    () =>
      collaboration && catalog && !pending && local.phase === "saved"
        ? upgradableElementIds(client.model, catalog).length
        : 0,
    [collaboration, catalog, pending, local.phase, local.revision, client.model]
  );

  return (
    <div
      className="text-tau-caption text-ink-2 flex min-h-8 items-center gap-2 px-3 py-1"
      role={status.tone === "error" ? "alert" : "status"}
    >
      <StatusDot tone={shown.tone} />
      <span className="min-w-0 truncate">{shown.label}</span>
      {actions.includes("retry-save") && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void client.flush().catch(() => undefined)}
        >
          重试保存
        </Button>
      )}
      {actions.includes("retry") && remoteSync && (
        <Button size="sm" variant="ghost" onClick={() => remoteSync.retry()}>
          重试同步
        </Button>
      )}
      {actions.includes("adopt") && remoteSync && (
        <Button size="sm" variant="soft" onClick={() => setConfirming("adopt")}>
          采用新版本
        </Button>
      )}
      {actions.includes("rebuild") && remoteSync && (
        <Button size="sm" variant="soft" onClick={() => setConfirming("rebuild")}>
          使用协作端版本
        </Button>
      )}
      {actions.includes("detach") && remoteSync && (
        <Button size="sm" variant="ghost" onClick={() => setConfirming("detach")}>
          转为本机白板
        </Button>
      )}
      {pending && share.data && (
        <PendingRecovery
          databaseName={databaseName}
          documentId={documentId}
          status={share.data}
          catalog={catalog}
        />
      )}
      <span className="flex-1" />
      {upgradable > 0 && (binding === null || remote?.phase === "synced") && (
        <Button size="sm" variant="ghost" onClick={() => setConfirming("upgrade")}>
          升级插件数据
        </Button>
      )}
      <ConfirmAction
        kind={confirming}
        onClose={() => setConfirming(undefined)}
        client={client}
        documentId={documentId}
        binding={binding}
        upgradable={upgradable}
        catalog={catalog}
      />
    </div>
  );
}

/** 右下状态栏的共享入口：未共享为「共享」，已共享为成员按钮（协作码、成员、结束共享）。 */
export function WhiteboardShareEntry({
  client,
  documentId,
}: {
  client: WhiteboardDocumentClient;
  documentId: string;
}) {
  const { remote } = useWhiteboardRemote(client);
  const share = useWhiteboardShareStatus(documentId);
  const [confirming, setConfirming] = useState<"close" | "leave">();
  if (!share.data) return null;
  const binding = share.data.binding ?? null;
  return (
    <>
      <WhiteboardShareControl
        client={client}
        binding={binding}
        pending={Boolean(pendingKind(share.data))}
        remote={remote}
        onUnshare={setConfirming}
      />
      <ConfirmAction
        kind={confirming}
        onClose={() => setConfirming(undefined)}
        client={client}
        documentId={documentId}
        binding={binding}
        upgradable={0}
      />
    </>
  );
}

type ConfirmKind = "adopt" | "rebuild" | "detach" | "close" | "leave" | "upgrade";
const CONFIRM_COPY: Record<
  ConfirmKind,
  { title: string; description: string; confirmText: string; impact?: string; danger?: boolean }
> = {
  adopt: {
    title: "采用新版本",
    description:
      "协作端已把这块白板更新为新版本。采用后这里换成新版本继续协作；本机尚未同步的改动不会混入新版本，会单独保留在本机。",
    confirmText: "采用新版本",
  },
  rebuild: {
    title: "使用协作端版本",
    description:
      "协作端没有接受这块白板上的部分改动。改用协作端当前的版本后可以继续协作；没被接受的改动不会再发送，会单独保留在本机。",
    impact: "这块白板上没被接受的改动会从画布上消失",
    confirmText: "使用协作端版本",
  },
  detach: {
    title: "转为本机白板",
    description:
      "这块白板已不能再同步。转为本机白板后可以照常编辑，内容留在本机；已缓存的图片一并保留，没缓存过的图片会显示为缺失。",
    confirmText: "转为本机白板",
  },
  close: {
    title: "结束共享",
    description:
      "结束后成员不能再打开或编辑这块白板，协作码随即失效。白板会留在你这里，包括成员已经同步上来的改动，图片会下载保存到本机。",
    impact: "成员手里留下的是各自的本机副本，之后的改动不会再互相同步",
    confirmText: "结束共享",
    danger: true,
  },
  leave: {
    title: "退出协作",
    description:
      "退出前会把你在这块白板上的改动同步给作者。退出后不再收到别人的改动，白板留在你这里作为本机白板。",
    confirmText: "退出协作",
    danger: true,
  },
  upgrade: {
    title: "升级插件数据",
    description:
      "插件有了新的数据格式。升级会把这块白板上用旧格式保存的元素转换为新格式，元素位置和文字不变；其它设备需要采用新版本后继续协作。升级期间白板暂停编辑。",
    impact: "升级完成后不能退回旧格式",
    confirmText: "开始升级",
  },
};

/** 每种确认操作沿用一个操作身份：失败后重试不换身份，成功后才清空。 */
function ConfirmAction({
  kind,
  onClose,
  client,
  documentId,
  binding,
  upgradable,
  catalog,
}: {
  kind?: ConfirmKind;
  onClose: () => void;
  client: WhiteboardDocumentClient;
  documentId: string;
  binding: { serverUrl: string; documentId: string } | null;
  upgradable: number;
  catalog?: WhiteboardContractCatalog;
}) {
  const queryClient = useQueryClient();
  const operations = useRef<Partial<Record<ConfirmKind, string>>>({});
  const [shown, setShown] = useState<ConfirmKind>("adopt");
  if (kind && kind !== shown) setShown(kind);
  const copy = CONFIRM_COPY[kind ?? shown];
  const run = async (action: ConfirmKind) => {
    const leaseId = client.leaseId;
    if (!leaseId) throw new Error("白板会话已关闭");
    const operationId = (operations.current[action] ??= crypto.randomUUID());
    if (action === "adopt" || action === "rebuild") {
      if (!binding) throw new Error("这块白板没有共享");
      await adoptWhiteboardEpoch(leaseId, {
        operationId,
        serverUrl: binding.serverUrl,
        rebuild: action === "rebuild",
      });
      toast.success(action === "adopt" ? "已采用新版本" : "已改用协作端版本");
    } else if (action === "upgrade") {
      if (!catalog) throw new Error("插件声明尚未就绪，请稍后重试");
      const source = await readWhiteboardMigrationSource(leaseId, operationId, binding?.serverUrl);
      await completeUpgrade(client.target.databaseName, operationId, source, catalog);
      toast.success("插件数据已升级");
    } else {
      const { missing } = await unshareWhiteboard(leaseId, { operationId, mode: action });
      toast.success(
        missing
          ? `${action === "close" ? "已结束共享" : action === "leave" ? "已退出协作" : "已转为本机白板"}，${missing} 张图片没有缓存，显示为缺失`
          : action === "close"
            ? "已结束共享，白板留在本机"
            : action === "leave"
              ? "已退出协作，白板留在本机"
              : "已转为本机白板"
      );
    }
    delete operations.current[action];
  };
  return (
    <ConfirmDialog
      open={Boolean(kind)}
      onOpenChange={open => !open && onClose()}
      title={copy.title}
      context={
        (kind ?? shown) === "upgrade"
          ? `${upgradable} 个元素`
          : client.model.read().title || "未命名白板"
      }
      description={copy.description}
      impact={copy.impact}
      danger={copy.danger}
      confirmText={copy.confirmText}
      loadingText="正在处理…"
      onConfirm={async () => {
        try {
          await run(kind!);
        } catch (error) {
          toast.error(remoteFailureText(error));
          throw error;
        } finally {
          void queryClient.invalidateQueries({
            queryKey: whiteboardShareStatusKey(client.target.databaseName, documentId),
          });
        }
      }}
    />
  );
}

/** 按冻结的来源计算转换候选并提交；同一来源与插件声明得到同一候选，续做时重新计算即可。 */
async function completeUpgrade(
  databaseName: string,
  operationId: string,
  source: { state: string; documentId: string },
  catalog: WhiteboardContractCatalog
) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(
    doc,
    Uint8Array.from(atob(source.state), char => char.charCodeAt(0))
  );
  const model = new WhiteboardModel(doc);
  try {
    const ids = upgradableElementIds(model, catalog);
    if (!ids.length) throw new Error("没有需要升级的元素，请取消这次升级");
    const bundle = prepareWhiteboardVersionUpgrade(model, source.documentId, catalog, ids);
    await prepareWhiteboardMigration(databaseName, operationId, bundle);
  } finally {
    model.dispose();
    doc.destroy();
  }
  const result = await finishWhiteboardMigration(databaseName, operationId);
  if (result.phase !== "COMPLETE") throw new Error("升级没有完成，原内容已保留，请稍后继续");
}

function pendingKind(status?: WhiteboardShareStatus): WhiteboardPendingKind | undefined {
  if (status?.publication) return "publication";
  if (status?.upgrade) return "upgrade";
  if (status?.migration) return "migration";
}

/** 已固定、尚未完成的操作只能按原操作继续或取消。 */
function PendingRecovery({
  databaseName,
  documentId,
  status,
  catalog,
  onSettled,
}: {
  databaseName: string;
  documentId: string;
  status: WhiteboardShareStatus;
  catalog?: WhiteboardContractCatalog;
  onSettled?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"resume" | "cancel">();
  if (status.publication)
    return (
      <PublicationRecovery
        databaseName={databaseName}
        operationId={status.publication.operationId}
        documentId={documentId}
        onSettled={onSettled}
      />
    );
  const upgrade = status.upgrade,
    migration = status.migration;
  const run = async (kind: "resume" | "cancel") => {
    setBusy(kind);
    try {
      if (upgrade) {
        if (kind === "cancel") {
          await finishWhiteboardMigration(databaseName, upgrade.operationId, true);
          toast.success("已取消升级，白板恢复编辑");
        } else if (migration?.operationId === upgrade.operationId) {
          await finishWhiteboardMigration(databaseName, upgrade.operationId);
          toast.success("插件数据已升级");
        } else {
          if (!catalog) throw new Error("插件声明尚未就绪，请稍后重试");
          const source = await readPendingWhiteboardUpgrade(databaseName, upgrade.operationId);
          await completeUpgrade(databaseName, upgrade.operationId, source, catalog);
          toast.success("插件数据已升级");
        }
      } else if (migration) {
        await finishWhiteboardMigration(databaseName, migration.operationId);
        toast.success("更新已完成");
      }
      onSettled?.();
    } catch (error) {
      toast.error(remoteFailureText(error));
    } finally {
      setBusy(undefined);
      void queryClient.invalidateQueries({
        queryKey: whiteboardShareStatusKey(databaseName, documentId),
      });
    }
  };
  return (
    <span className="flex flex-none items-center gap-1">
      <Button
        size="sm"
        variant="soft"
        loading={busy === "resume"}
        disabled={Boolean(busy)}
        onClick={() => void run("resume")}
      >
        {upgrade ? "继续升级" : "继续更新"}
      </Button>
      {upgrade && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "cancel"}
          disabled={Boolean(busy)}
          onClick={() => void run("cancel")}
        >
          取消升级
        </Button>
      )}
    </span>
  );
}

/**
 * 未完成的首次共享或升级会让白板暂停打开；此时给出续做入口，不展示为读取失败。
 * 没有待处理操作时显示调用方的原错误。
 */
export function PendingTransition({
  databaseName,
  documentId,
  catalog,
  onSettled,
  children,
}: {
  databaseName: string;
  documentId: string;
  catalog?: WhiteboardContractCatalog;
  onSettled: () => void;
  children: ReactNode;
}) {
  const share = useWhiteboardShareStatus(documentId);
  const kind = pendingKind(share.data);
  if (!kind || !share.data) return children;
  const description: Record<WhiteboardPendingKind, string> = {
    publication:
      "上次共享没有完成，白板暂停编辑，内容完好保存在本机。可以继续这次共享，或取消后恢复编辑。",
    upgrade:
      "上次插件数据升级没有完成，白板暂停编辑，原内容完好保存在本机。可以继续这次升级，或取消后恢复编辑。",
    migration:
      "上次版本更新没有完成，白板暂停编辑，原内容完好保存在本机。继续后会按原来的更新完成安装。",
  };
  return (
    <div role="status" className="text-ink-2 text-tau-body flex flex-col items-start gap-3 p-6">
      <p>{description[kind]}</p>
      <PendingRecovery
        databaseName={databaseName}
        documentId={documentId}
        status={share.data}
        catalog={catalog}
        onSettled={onSettled}
      />
    </div>
  );
}

/** 首次共享结果未知或中途失败：只能按原操作继续或取消，白板在此期间保持暂停。 */
export function PublicationRecovery({
  databaseName,
  operationId,
  documentId,
  onSettled,
}: {
  databaseName: string;
  operationId: string;
  documentId: string;
  onSettled?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"resume" | "cancel">();
  const run = async (kind: "resume" | "cancel") => {
    setBusy(kind);
    try {
      if (kind === "resume") {
        await resumeWhiteboardPublication(databaseName, operationId);
        toast.success("白板已共享");
      } else {
        await cancelWhiteboardPublication(databaseName, operationId);
        toast.success("已取消共享，白板恢复编辑");
      }
      onSettled?.();
    } catch (error) {
      toast.error(remoteFailureText(error));
    } finally {
      setBusy(undefined);
      void queryClient.invalidateQueries({
        queryKey: whiteboardShareStatusKey(databaseName, documentId),
      });
    }
  };
  return (
    <span className="flex flex-none items-center gap-1">
      <Button
        size="sm"
        variant="soft"
        loading={busy === "resume"}
        disabled={Boolean(busy)}
        onClick={() => void run("resume")}
      >
        继续共享
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "cancel"}
        disabled={Boolean(busy)}
        onClick={() => void run("cancel")}
      >
        取消共享
      </Button>
    </span>
  );
}

function WhiteboardShareControl({
  client,
  binding,
  pending,
  remote,
  onUnshare,
}: {
  client: WhiteboardDocumentClient;
  binding: { serverUrl: string; documentId: string } | null;
  /** 首次共享尚未完成：入口隐藏，已打开的对话框保留以显示失败原因。 */
  pending: boolean;
  remote?: WhiteboardRemoteState;
  onUnshare: (mode: "close" | "leave") => void;
}) {
  const room = useCollaborationStore(state =>
    binding ? state.whiteboards?.find(item => item.id === binding.documentId) : undefined
  );
  const requests = useCollaborationStore(state => state.requests);
  const deviceId = useCollaborationStore(state => state.deviceId);
  const [open, setOpen] = useState(false);

  if (!binding)
    return (
      <>
        {!pending && (
          <Button
            variant="ghost"
            icon={Share2}
            className="aria-expanded:bg-press h-[30px] px-2.5"
            onClick={() => setOpen(true)}
          >
            共享
          </Button>
        )}
        <ShareDialog open={open} onOpenChange={setOpen} client={client} />
      </>
    );
  const session = room && whiteboardSession(room, remote);
  return (
    <Popover
      placement="top-end"
      arrow={false}
      className="w-[340px]"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label="白板协作成员"
          className="text-ink-2 hover:bg-hover hover:text-ink-1 aria-expanded:bg-press flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] pr-2.5 pl-1.5 transition-colors"
        >
          {session ? (
            <>
              <AvatarStack members={session.members} max={3} size={18} />
              <span className="whitespace-nowrap">{othersSummary(session, deviceId)}</span>
            </>
          ) : (
            <>
              <Users className="size-3.5" strokeWidth={1.75} />
              <span className="whitespace-nowrap">已共享</span>
            </>
          )}
        </button>
      }
    >
      <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
        {session?.role === "owner" ? "成员与邀请" : "成员"}
      </Popover.Header>
      <Popover.Body>
        {session ? (
          <SharePanel session={session} requests={requests} deviceId={deviceId} />
        ) : (
          <p className="text-ink-2 text-tau-meta">
            正在读取成员信息。连上协作服务后，这里会显示协作码和成员。
          </p>
        )}
      </Popover.Body>
      <Popover.Footer>
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto"
          onClick={() => {
            try {
              openPage("collaboration");
              setOpen(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "无法打开协作页");
            }
          }}
        >
          在协作页查看
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Button>
        {session && session.status === "active" && !pending && (
          <Button
            variant="danger-soft"
            size="sm"
            icon={LogOut}
            onClick={() => {
              setOpen(false);
              onUnshare(session.role === "owner" ? "close" : "leave");
            }}
          >
            {session.role === "owner" ? "结束共享" : "退出协作"}
          </Button>
        )}
      </Popover.Footer>
    </Popover>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: WhiteboardDocumentClient;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const snapshot = client.model.read();
  const points = [
    { icon: KeyRound, text: "生成一个 12 位协作码，对方输入后需要你同意" },
    { icon: Layers, text: `共享整块白板的全部 ${snapshot.pages.length} 页` },
    { icon: Link2, text: "引用的文章、卡片只带卡面标题，原文不会随之共享" },
    { icon: VideoOff, text: "本机视频不会上传，含本机视频的白板暂不能共享" },
  ];
  const share = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await publishWhiteboardClient(client);
      toast.success("白板已共享，点右下角的成员按钮查看协作码");
      onOpenChange(false);
    } catch (failure) {
      setError(remoteFailureText(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setError(undefined)}
      locked={busy}
      width={480}
      title="共享白板"
      context={snapshot.title || "未命名白板"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            icon={Share2}
            data-autofocus
            loading={busy}
            loadingText="正在共享…"
            onClick={() => void share()}
          >
            发起共享
          </Button>
        </>
      }
    >
      <DialogBody>
        {error && (
          <p
            role="alert"
            className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm mb-3 px-3 py-2"
          >
            {error}
          </p>
        )}
        <div className="text-ink-2 text-tau-body">
          <p>把这块白板共享给其他设备一起编辑。共享后它仍在原处，你照常在这里画。</p>
          <ul className="mt-3 flex flex-col gap-2">
            {points.map(point => (
              <li key={point.text} className="flex items-start gap-2.5">
                <point.icon className="text-ink-3 mt-[3px] size-3.5 flex-none" strokeWidth={1.75} />
                <span className="text-tau-meta">{point.text}</span>
              </li>
            ))}
          </ul>
          {busy && (
            <p className="text-ink-3 text-tau-sm mt-3 flex items-center gap-1.5">
              <Users className="size-3.5" strokeWidth={1.75} />
              正在暂停编辑、上传图片并创建共享白板…
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
