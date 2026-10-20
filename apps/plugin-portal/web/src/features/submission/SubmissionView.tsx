import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Github,
  RefreshCw,
  Reply,
  Send,
  Trash2,
  Undo2,
  Upload as UploadIcon,
} from "lucide-react";
import { Button, ConfirmDialog, Input, Panel } from "@tau/ui";
import type { ReviewDetails, Submission, Upload } from "../../../../contracts";
import { queryKeys, useApi } from "../../app/api";
import { useSession } from "../../app/session";
import { errorMessage } from "../../api/errors";
import { Notice } from "../../components/Notice";
import { PageHeader, StatusTag } from "../../components/PageHeader";
import { PluginMark } from "../../components/PluginMark";
import { formatRelative } from "../../components/format";
import { usePluginReleases } from "../catalog/queries";
import { FeedbackThread } from "./FeedbackThread";
import { PackageCard } from "./PackageCard";
import { PackageDropZone } from "./PackageDropZone";
import { PackagePreview } from "./PackagePreview";
import { ProgressTimeline } from "./ProgressTimeline";
import { SubmitChecklist, type CheckItem } from "./SubmitChecklist";
import { UploadTaskCard } from "./UploadTaskCard";
import { useReviewDetails } from "./queries";
import { isTaskActive, useUploadTasks } from "./useUploadTasks";
import { precheckFile } from "./validation";
import { blockingRelease } from "./versions";

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
const THREAD_ID = "submission-thread";

const scrollToThread = () =>
  document.getElementById(THREAD_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });

/** 页顶状态条：告诉作者现在处于哪一步、下一步做什么 */
function StatusBanner({
  submission,
  details,
  onReupload,
  onWithdraw,
}: {
  submission: Submission;
  details: ReviewDetails | undefined;
  onReupload: () => void;
  onWithdraw: () => void;
}) {
  const latest = details?.reviews[0];
  const release = details?.release;
  switch (submission.status) {
    case "changes_requested":
      return (
        <Notice
          tone="warn"
          title={`审核者要求修改${latest ? ` · ${formatRelative(latest.createdAt)}` : ""}`}
          actions={
            <>
              <Button size="sm" icon={UploadIcon} onClick={onReupload}>
                上传修改后的包
              </Button>
              <Button size="sm" variant="ghost" icon={Reply} onClick={scrollToThread}>
                回复
              </Button>
            </>
          }
        >
          <p className="whitespace-pre-wrap">{latest?.comment}</p>
        </Notice>
      );
    case "pending_review":
      return (
        <Notice
          tone="info"
          title="已提交，等待审核"
          actions={
            submission.owned && (
              <Button size="sm" variant="ghost" icon={Undo2} onClick={onWithdraw}>
                撤回提交
              </Button>
            )
          }
        >
          提交内容已冻结；审核意见和问题会出现在下方的「沟通」里。撤回后可继续修改或删除。
        </Notice>
      );
    case "rejected":
      return (
        <Notice tone="danger" title="审核未通过">
          <p className="whitespace-pre-wrap">{latest?.comment}</p>
          <p className="mt-1">这条提交已结束；修改后回到「我的提交」点「发布新版本」重新发布。</p>
        </Notice>
      );
    case "approved":
      if (release?.state === "published")
        return (
          <Notice
            tone="ok"
            title={`已发布 v${release.version}`}
            actions={
              <Link
                to={`/plugins/${encodeURIComponent(release.pluginId)}`}
                className="text-tau-sm text-accent-text inline-flex items-center gap-1 font-medium"
              >
                在插件中心查看
                <ArrowRight size={14} />
              </Link>
            }
          >
            已上架插件中心，桌面端检查更新时会提示用户。
          </Notice>
        );
      if (release?.state === "failed")
        return (
          <Notice tone="warn" title="审核已通过，发布失败">
            {release.error ?? "发布存储暂时不可用"}；管理员重试发布后会自动上架，无需重新提交。
          </Notice>
        );
      return (
        <Notice tone="info" title="审核已通过，正在发布">
          通常几秒内完成，完成后会出现在插件中心。
        </Notice>
      );
    default:
      return null;
  }
}

export function SubmissionView({ submission }: { submission: Submission }) {
  const api = useApi(),
    client = useQueryClient();
  const session = useSession();
  const navigate = useNavigate();
  const [repository, setRepository] = useState(submission.repository);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const revision = useRef(submission.revision);
  const picker = useRef<HTMLInputElement>(null);
  const editable = submission.canEdit;
  const content = editable ? (upload?.content ?? submission.content) : submission.content;
  const manifest = content?.manifest;
  const dirty = repository !== submission.repository || !!upload;
  useEffect(() => {
    if (revision.current !== submission.revision) {
      if (dirty) setConflict(true);
      else {
        revision.current = submission.revision;
        setRepository(submission.repository);
      }
    }
  }, [submission.revision, submission.repository, dirty]);
  const details = useReviewDetails(submission.id, !!submission.submittedAt);
  // 预绑定了插件但暂时没有包时，也按目标插件核对已发布版本
  const releases = usePluginReleases(editable ? (manifest?.id ?? submission.pluginId) : null);
  const uploads = useUploadTasks(value => {
    setUpload(value);
    setError("");
  });
  const active = uploads.tasks.some(isTaskActive);
  const publish = (value: Submission) => {
    revision.current = value.revision;
    setRepository(value.repository);
    setUpload(null);
    client.setQueryData(queryKeys.submission(value.id), value);
    void client.invalidateQueries({ queryKey: queryKeys.submissions });
  };
  const save = async () => {
    const result = await api.saveSubmission(submission.id, {
      revision: revision.current,
      packageUploadId: upload?.id ?? submission.packageUploadId,
      repository: repository.trim(),
    });
    publish(result);
    return result;
  };
  const action = useMutation({
    mutationFn: async (submit: boolean) => {
      const value = dirty ? await save() : submission;
      return submit ? api.submitSubmission(value.id, value.revision) : value;
    },
    onSuccess: publish,
    onError: (e: Error) => {
      setError(e.message);
      void client.invalidateQueries({ queryKey: queryKeys.submission(submission.id) });
    },
  });
  const [confirming, setConfirming] = useState<"withdraw" | "delete" | null>(null);
  const withdraw = useMutation({
    mutationFn: () => api.withdrawSubmission(submission.id, submission.revision),
    onSuccess: value => {
      setConfirming(null);
      publish(value);
    },
    onError: () => void client.invalidateQueries({ queryKey: queryKeys.submission(submission.id) }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSubmission(submission.id),
    onSuccess: () => {
      setConfirming(null);
      client.removeQueries({ queryKey: queryKeys.submission(submission.id) });
      void client.invalidateQueries({ queryKey: queryKeys.submissions });
      navigate("/submissions", { replace: true });
    },
  });
  const pick = (file?: File) => {
    if (!file) return;
    const issue = precheckFile(file);
    if (issue) setError(issue);
    else uploads.start(file);
  };
  const busy = active || action.isPending || conflict;
  // 曾进入审核的草稿（如要求修改后撤回）保留审核记录，服务端拒绝删除，这里不给入口
  const deletable =
    submission.owned && submission.status === "draft" && !details.data?.reviews.length;

  const repoTyped = repository.trim();
  const repoValid = GITHUB_REPOSITORY.test(repoTyped);
  const blocking = manifest ? blockingRelease(releases.data?.items, manifest.version) : null;
  const checks: CheckItem[] = [
    {
      key: "package",
      state: content ? "done" : "todo",
      title: "插件包通过静态校验",
      detail: content ? "manifest 与完整性摘要正确" : "上传 ZIP 后自动检查",
    },
    {
      key: "version",
      state: !manifest ? "todo" : blocking ? "bad" : "done",
      title: "版本号高于已发布版本",
      detail: !manifest
        ? undefined
        : blocking
          ? `已发布 v${blocking.version}，请提高版本号后重新打包`
          : releases.data?.items.length
            ? `将发布 v${manifest.version}`
            : releases.isPending
              ? "正在核对已发布版本…"
              : "首次发布",
    },
    {
      key: "repository",
      state: repoValid ? "done" : repoTyped ? "bad" : "todo",
      title: "关联源码仓库",
      detail:
        repoTyped && !repoValid
          ? "格式为 https://github.com/作者/仓库"
          : "提交时自动记录当前 commit",
    },
  ];
  const ready = !!content && repoValid && !blocking;
  const reviewerElsewhere =
    session.data?.reviewer && !editable && submission.status === "pending_review";

  return (
    <>
      <PageHeader
        back={{ to: "/submissions", label: "我的提交" }}
        title={
          <span className="flex items-center gap-3">
            {manifest && <PluginMark pluginId={manifest.id} name={manifest.name} size="lg" />}
            {manifest?.name ??
              (submission.pluginId ? `为 ${submission.pluginId} 发布新版本` : "新的插件提交")}
          </span>
        }
        tag={<StatusTag status={submission.status} />}
        meta={
          manifest
            ? "资料来自插件包；要改说明，请修改 README 后重新打包。"
            : "上传插件 ZIP 开始一次新的发布。"
        }
        actions={
          reviewerElsewhere && (
            <Button
              variant="soft"
              onClick={() => navigate(`/review/${encodeURIComponent(submission.id)}`)}
            >
              去审核
            </Button>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {submission.disabled && (
            <Notice
              tone="warn"
              title={`该插件已被管理员禁用 · ${formatRelative(submission.disabled.at)}`}
            >
              <p className="whitespace-pre-wrap">原因：{submission.disabled.reason}</p>
              <p className="mt-1">
                禁用期间插件中心不显示、不可搜索与下载，已安装用户不受影响。提交整改版本并通过审核后，由管理员恢复上架。
              </p>
            </Notice>
          )}
          <StatusBanner
            submission={submission}
            details={details.data}
            onReupload={() => picker.current?.click()}
            onWithdraw={() => {
              withdraw.reset();
              setConfirming("withdraw");
            }}
          />
          {editable && (
            <input
              ref={picker}
              aria-label="插件ZIP"
              type="file"
              accept=".zip"
              className="hidden"
              disabled={busy}
              onChange={event => {
                pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          )}
          {editable && !content && !active && <PackageDropZone disabled={busy} onFile={pick} />}
          {uploads.tasks.map(task => (
            <UploadTaskCard key={task.key} task={task} uploads={uploads} />
          ))}
          {manifest && (
            <PackageCard
              manifest={manifest}
              size={editable ? upload?.size : undefined}
              actions={
                editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RefreshCw}
                    disabled={busy}
                    onClick={() => picker.current?.click()}
                  >
                    替换
                  </Button>
                )
              }
            />
          )}
          {error && (
            <Notice tone="danger" title="操作没有完成">
              {error}
            </Notice>
          )}
          {editable && conflict && (
            <Notice
              tone="warn"
              title="草稿已在其他窗口更新"
              actions={
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      revision.current = submission.revision;
                      setRepository(submission.repository);
                      setUpload(null);
                      setConflict(false);
                    }}
                  >
                    使用最新版本
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      revision.current = submission.revision;
                      setConflict(false);
                    }}
                  >
                    保留本地修改
                  </Button>
                </>
              }
            >
              本地输入仍保留，请核对后选择处理方式。
            </Notice>
          )}
          {content && <PackagePreview content={content} upload={editable ? upload : null} />}
          {submission.submittedAt && (
            <FeedbackThread
              id={THREAD_ID}
              submissionId={submission.id}
              placeholder="回复审核者，或描述遇到的问题…"
            />
          )}
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-[84px]">
          {editable ? (
            <Panel className="flex flex-col gap-3">
              <h2 className="text-tau-body text-ink-1 font-semibold">提交前检查</h2>
              <SubmitChecklist items={checks} />
              <Input
                lead={Github}
                aria-label="源码仓库"
                aria-invalid={!!repoTyped && !repoValid}
                value={repository}
                disabled={action.isPending || conflict}
                onChange={event => setRepository(event.target.value)}
                placeholder="https://github.com/作者/仓库"
              />
              <Button
                variant="primary"
                block
                icon={Send}
                disabled={!ready || busy}
                loading={action.isPending && action.variables === true}
                onClick={() => action.mutate(true)}
              >
                {submission.status === "changes_requested" ? "重新提交审核" : "提交审核"}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!dirty || busy}
                  loading={action.isPending && action.variables === false}
                  onClick={() => action.mutate(false)}
                >
                  保存草稿
                </Button>
                {deletable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    disabled={busy}
                    onClick={() => {
                      remove.reset();
                      setConfirming("delete");
                    }}
                  >
                    删除草稿
                  </Button>
                )}
                {dirty && <span className="text-tau-micro text-ink-3 ml-auto">有未保存的修改</span>}
              </div>
            </Panel>
          ) : (
            <Panel pad="compact" className="flex flex-col gap-1.5">
              <h2 className="text-tau-sm text-ink-3 font-medium">源码仓库</h2>
              {submission.repository ? (
                <a
                  href={submission.repository}
                  target="_blank"
                  rel="noreferrer"
                  className="text-tau-meta text-accent-text inline-flex items-center gap-1.5 break-all hover:underline"
                >
                  <Github size={14} className="shrink-0" />
                  {submission.repository.replace("https://github.com/", "")}
                </a>
              ) : (
                <p className="text-tau-meta text-ink-3">未关联</p>
              )}
              {submission.commit && (
                <p className="text-tau-micro text-ink-3 font-tau-mono break-all">
                  提交时快照 {submission.commit.slice(0, 12)}（不代表已验证包与源码一致）
                </p>
              )}
            </Panel>
          )}
          <ProgressTimeline submission={submission} details={details.data} />
        </aside>
      </div>
      <ConfirmDialog
        open={confirming === "withdraw"}
        title="撤回提交"
        context={manifest ? `${manifest.name} v${manifest.version}` : undefined}
        confirmText="撤回"
        onOpenChange={open => {
          if (!open) setConfirming(null);
        }}
        description={
          <div className="flex flex-col gap-2">
            <p>撤回后这条提交退回草稿，审核者不再处理；你可以继续修改后重新提交，或删除它。</p>
            {withdraw.isError && (
              <p role="alert" className="text-tau-sm text-danger">
                {errorMessage(withdraw.error)}
              </p>
            )}
          </div>
        }
        onConfirm={() => withdraw.mutateAsync()}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title="删除草稿"
        context={manifest ? `${manifest.name} v${manifest.version}` : undefined}
        danger
        confirmText="删除"
        onOpenChange={open => {
          if (!open) setConfirming(null);
        }}
        description={
          <div className="flex flex-col gap-2">
            <p>草稿与其中的沟通记录将被删除，已上传的包不再关联到任何提交。此操作不可恢复。</p>
            {remove.isError && (
              <p role="alert" className="text-tau-sm text-danger">
                {errorMessage(remove.error)}
              </p>
            )}
          </div>
        }
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  );
}
