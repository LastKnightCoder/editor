import { useEffect, type ReactNode } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { Panel, PanelTitle } from "@tau/ui";
import type { Submission } from "../../../../contracts";
import { Markdown } from "../../components/markdown/Markdown";
import { Notice } from "../../components/Notice";
import { PageHeader, StatusTag } from "../../components/PageHeader";
import { formatTime } from "../../components/format";
import { safeHref } from "../../components/markdown/parse";
import { localBackups } from "./localBackups";
import { PackageFacts } from "./PackageFacts";
import { UploadImage } from "./UploadImage";
import { useUploadRecord } from "./uploadQueries";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="flex flex-col gap-3">
      <PanelTitle>{title}</PanelTitle>
      {children}
    </Panel>
  );
}

function ExternalUrl({ url }: { url: string }) {
  const href = safeHref(url);
  if (!href) return <span className="text-tau-sm text-ink-1 break-all">{url || "—"}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-tau-sm text-accent-text inline-flex items-center gap-1 break-all hover:underline"
    >
      {url}
      <ExternalLink size={12} className="shrink-0" />
    </a>
  );
}

/** 待审核：内容冻结，只读展示提交时的资料 */
export function SubmissionReadOnly({ submission }: { submission: Submission }) {
  const { listing, manifest } = submission;
  const packageRecord = useUploadRecord(submission.packageUploadId);

  // 已提交的记录不再接受本地暂存
  useEffect(() => localBackups.remove(submission.id), [submission.id]);

  return (
    <>
      <PageHeader
        back={{ to: "/submissions", label: "我的提交" }}
        title={manifest?.name ?? "插件提交"}
        tag={<StatusTag status={submission.status} />}
        meta={`${manifest ? `${manifest.id} · v${manifest.version} · ` : ""}提交于 ${formatTime(submission.submittedAt)}`}
      />
      <Notice tone="info" title="已提交，等待审核" className="mb-5">
        <span className="inline-flex items-center gap-1">
          <Lock size={12} />
          待审内容已冻结，本期不能修改或撤回；审核反馈将在后续版本提供。
        </span>
      </Notice>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              {listing.iconUploadId && (
                <UploadImage
                  id={listing.iconUploadId}
                  alt="插件图标"
                  className="border-line-1 size-16 shrink-0 border"
                />
              )}
              <p className="text-tau-body-lg text-ink-1 pt-1">{listing.summary}</p>
            </div>
            <Markdown source={listing.description} />
          </Panel>
          {listing.screenshotUploadIds.length > 0 && (
            <Block title="截图">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {listing.screenshotUploadIds.map((id, index) => (
                  <li key={id}>
                    <UploadImage
                      id={id}
                      alt={`截图 ${index + 1}`}
                      className="border-line-1 aspect-[16/10] w-full border"
                    />
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title="更新说明">
            <Markdown source={listing.changelog} />
          </Block>
          {manifest && (
            <Block title="插件包">
              <PackageFacts manifest={manifest} upload={packageRecord.data ?? null} />
            </Block>
          )}
        </div>
        <aside className="flex flex-col gap-5 lg:sticky lg:top-20">
          <Block title="源码与支持">
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-tau-micro text-ink-3">源码仓库</dt>
                <dd>
                  <ExternalUrl url={listing.repository} />
                </dd>
              </div>
              <div>
                <dt className="text-tau-micro text-ink-3">Commit</dt>
                <dd className="text-tau-sm text-ink-1 font-tau-mono break-all">{listing.commit}</dd>
              </div>
              <div>
                <dt className="text-tau-micro text-ink-3">反馈地址</dt>
                <dd>
                  <ExternalUrl url={listing.supportUrl} />
                </dd>
              </div>
            </dl>
          </Block>
        </aside>
      </div>
    </>
  );
}
