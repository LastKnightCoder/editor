import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea } from "@tau/ui";
import type { Submission, Upload } from "../../../../contracts";
import { useApi, queryKeys } from "../../app/api";
import { PageHeader, StatusTag } from "../../components/PageHeader";
import { Markdown } from "../../components/markdown/Markdown";
import { Section } from "./Section";
import { PackageFacts } from "./PackageFacts";
import { useUploadTasks, isTaskActive } from "./useUploadTasks";
import { UploadTaskCard } from "./UploadTaskCard";
import { precheckFile } from "./validation";
import { ReviewPanel } from "./ReviewPanel";

export function SubmissionView({ submission }: { submission: Submission }) {
  const api = useApi(),
    client = useQueryClient();
  const [repository, setRepository] = useState(submission.repository);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const revision = useRef(submission.revision);
  const content = submission.canEdit ? (upload?.content ?? submission.content) : submission.content;
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
  const pick = (file?: File) => {
    if (!file) return;
    const issue = precheckFile(file);
    if (issue) setError(issue);
    else uploads.start(file);
  };
  return (
    <>
      <PageHeader
        back={{ to: "/submissions", label: "返回提交列表" }}
        title={content?.manifest.name ?? "新的插件提交"}
        tag={<StatusTag status={submission.status} />}
        meta="资料来自插件包，修改说明请重新打包。"
      />
      <div className="flex flex-col gap-5">
        {submission.submittedAt && <ReviewPanel submission={submission} />}
        {submission.canEdit && (
          <Section
            index={1}
            title="上传插件 ZIP"
            description="包内需包含 manifest.json、README.md 和运行文件。不需要单独填写介绍或上传截图。"
          >
            <input
              aria-label="插件ZIP"
              type="file"
              accept=".zip"
              disabled={active || action.isPending || conflict}
              onChange={e => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {uploads.tasks.map(task => (
              <UploadTaskCard key={task.key} task={task} uploads={uploads} />
            ))}
          </Section>
        )}
        {content && (
          <Section title="插件资料">
            <PackageFacts manifest={content.manifest} upload={submission.canEdit ? upload : null} />
            <p className="text-ink-2 text-tau-sm">{content.manifest.description}</p>
          </Section>
        )}
        <Section
          title="源码仓库"
          description="首次关联仓库；后续版本会复用。提交时自动记录仓库版本，不要求手填 commit。"
        >
          {submission.canEdit ? (
            <Input
              aria-label="源码仓库"
              value={repository}
              disabled={action.isPending || conflict}
              onChange={e => setRepository(e.target.value)}
              placeholder="https://github.com/作者/仓库"
            />
          ) : (
            <a href={submission.repository} target="_blank" rel="noreferrer">
              {submission.repository}
            </a>
          )}
          {submission.commit && (
            <p className="text-ink-3 text-tau-micro break-all">
              提交时源码快照：{submission.commit}（不代表已验证包与源码构建一致）
            </p>
          )}
        </Section>
        {content && (
          <Section title="介绍与使用说明" description="读取自包内 README.md">
            <Markdown source={content.readme} />
          </Section>
        )}
        {content?.changelog && (
          <Section title="更新说明">
            <Markdown source={content.changelog} />
          </Section>
        )}
        {error && (
          <p role="alert" className="text-danger text-tau-sm">
            {error}
          </p>
        )}
        {submission.canEdit && conflict && (
          <Section title="草稿已在其他窗口更新">
            <p>本地输入仍保留，请核对后选择处理方式。</p>
            <Button
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
              onClick={() => {
                revision.current = submission.revision;
                setConflict(false);
              }}
            >
              保留本地修改
            </Button>
          </Section>
        )}
        {submission.canEdit ? (
          <div className="flex gap-3">
            <Button
              disabled={!dirty || active || action.isPending || conflict}
              onClick={() => action.mutate(false)}
            >
              保存草稿
            </Button>
            <Button
              variant="primary"
              disabled={!content || active || action.isPending || conflict}
              loading={action.isPending}
              onClick={() => action.mutate(true)}
            >
              {submission.status === "changes_requested" ? "重新提交审核" : "提交审核"}
            </Button>
          </div>
        ) : (
          <p className="text-ink-3 text-tau-sm">提交内容已冻结；问题与审核意见请在下方站内交流。</p>
        )}
        {submission.submittedAt && <Feedback submissionId={submission.id} />}
      </div>
    </>
  );
}

function Feedback({ submissionId }: { submissionId: string }) {
  const api = useApi(),
    client = useQueryClient(),
    [message, setMessage] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const key = ["feedback", submissionId];
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.listFeedback(submissionId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: p => p.nextCursor,
    refetchOnWindowFocus: true,
  });
  const send = useMutation({
    mutationFn: () => api.sendFeedback(submissionId, message, requestId.current),
    onSuccess: () => {
      setMessage("");
      requestId.current = crypto.randomUUID();
      void client.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <Section title="站内反馈" description="仅提交作者与审核者可见，无需 GitHub 或外部反馈地址。">
      {query.isError && (
        <p role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>重试</Button>
        </p>
      )}
      {query.data?.pages
        .flatMap(p => p.items)
        .map(item => (
          <article key={item.id} className="border-line-1 border-b py-3">
            <p className="text-ink-3 text-tau-micro">
              {item.author.login} · {item.role === "reviewer" ? "审核者" : "作者"} ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </p>
            <p className="text-ink-1 text-tau-sm whitespace-pre-wrap">{item.message}</p>
          </article>
        ))}
      {query.hasNextPage && <Button onClick={() => void query.fetchNextPage()}>加载更多</Button>}
      <Textarea
        aria-label="反馈内容"
        maxLength={4000}
        value={message}
        disabled={send.isPending}
        onChange={e => {
          setMessage(e.target.value);
          requestId.current = crypto.randomUUID();
        }}
        placeholder="描述问题或回复审核意见"
      />
      {send.isError && <p role="alert">{send.error.message}</p>}
      <Button
        disabled={!message.trim() || send.isPending}
        loading={send.isPending}
        onClick={() => send.mutate()}
      >
        发送反馈
      </Button>
    </Section>
  );
}
