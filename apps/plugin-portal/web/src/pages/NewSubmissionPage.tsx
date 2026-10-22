import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import type { Upload } from "../../../contracts";
import { queryKeys, useApi } from "../app/api";
import { hasCode } from "../api/errors";
import { Notice } from "../components/Notice";
import { PageHeader } from "../components/PageHeader";
import { PluginMark } from "../components/PluginMark";
import { highestRelease, usePluginReleases } from "../features/catalog/queries";
import { PackageDropZone } from "../features/submission/PackageDropZone";
import { UploadTaskCard } from "../features/submission/UploadTaskCard";
import { isTaskActive, useUploadTasks } from "../features/submission/useUploadTasks";
import { precheckFile } from "../features/submission/validation";

const REQUEST_KEY = "tau-portal:new-request";

/** 同一标签页内的新建请求 ID：刷新或重试复用，服务端据此返回同一草稿 */
function pendingRequestId(): string {
  try {
    const saved = sessionStorage.getItem(REQUEST_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem(REQUEST_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function clearRequestId() {
  try {
    sessionStorage.removeItem(REQUEST_KEY);
  } catch {
    /* 无存储时每次进入都是新的请求 */
  }
}

/**
 * 新建提交：先上传 ZIP，服务端校验通过后才创建草稿并跳转详情；什么都不做离开不留记录。
 * 带 ?plugin= 时是「发布新版本」：草稿预绑定该插件，包内 manifest.id 必须一致。
 */
export function NewSubmissionPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = params.get("plugin") || null;
  const requestId = useRef(pendingRequestId());
  const [issue, setIssue] = useState("");
  const [ready, setReady] = useState<Upload | null>(null);
  const releases = usePluginReleases(target);
  const current = highestRelease(releases.data?.items);

  const create = useMutation({
    mutationFn: (upload: Upload) =>
      api.createSubmission({
        clientRequestId: requestId.current,
        packageUploadId: upload.id,
        ...(target ? { pluginId: target } : {}),
      }),
    onSuccess: submission => {
      clearRequestId();
      queryClient.setQueryData(queryKeys.submission(submission.id), submission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions });
      navigate(`/submissions/${encodeURIComponent(submission.id)}`, { replace: true });
    },
    onError: (error: Error) => setIssue(error.message),
  });
  const uploads = useUploadTasks(upload => {
    const manifest = upload.content?.manifest;
    if (target && manifest && manifest.id !== target) {
      setIssue(
        `这个包的插件 ID 是 ${manifest.id}，不是 ${target} 的新版本；请重新打包，或回到「我的提交」用「发布新插件」。`
      );
      return;
    }
    setIssue("");
    setReady(upload);
    create.mutate(upload);
  });
  const active = uploads.tasks.some(isTaskActive);
  const busy = active || create.isPending;
  const limitExceeded = create.isError && hasCode(create.error, "LIMIT_EXCEEDED");
  const pick = (file: File) => {
    setReady(null);
    create.reset();
    const problem = precheckFile(file);
    if (problem) return setIssue(problem);
    setIssue("");
    uploads.start(file);
  };

  const name = current?.manifest.name ?? target;
  const meta = target
    ? current
      ? `当前已发布 v${current.version}，请上传版本号更高的 ZIP。`
      : releases.isPending
        ? "正在核对已发布版本…"
        : "请上传该插件的 ZIP；校验通过后才会创建草稿。"
    : "上传插件 ZIP；校验通过后才会创建草稿，之后再关联源码仓库并提交审核。";

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        back={{ to: "/submissions", label: "我的提交" }}
        title={
          target ? (
            <span className="flex items-center gap-3">
              <PluginMark pluginId={target} name={name ?? target} size="lg" />为 {name} 发布新版本
            </span>
          ) : (
            "发布新插件"
          )
        }
        meta={meta}
      />
      <div className="flex flex-col gap-5">
        {!busy && <PackageDropZone disabled={busy} onFile={pick} />}
        {uploads.tasks.map(task => (
          <UploadTaskCard key={task.key} task={task} uploads={uploads} />
        ))}
        {create.isPending && <Loading label="包已通过校验，正在创建草稿…" />}
        {issue && (
          <Notice
            tone="danger"
            title={limitExceeded ? "未完成的提交已达上限" : "还不能创建提交"}
            actions={
              ready &&
              create.isError &&
              (limitExceeded ? (
                <Button size="sm" onClick={() => navigate("/submissions")}>
                  管理我的提交
                </Button>
              ) : (
                <Button size="sm" icon={RefreshCw} onClick={() => create.mutate(ready)}>
                  重试创建
                </Button>
              ))
            }
          >
            {issue}
          </Notice>
        )}
      </div>
    </div>
  );
}
