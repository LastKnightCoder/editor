import { pluginTranslator, usePluginI18n } from "@/features/plugins/i18n";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Textarea, Tooltip, cn } from "@tau/ui";
import { usePluginCommunity } from "../queries";
const t = pluginTranslator.t;

export function PluginCommunityTab({ pluginId }: { pluginId: string }) {
  const { locale } = usePluginI18n();
  const { query, like, comment, remove } = usePluginCommunity(pluginId);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pending = useRef<{ message: string; requestId: string } | null>(null);
  const first = query.data?.pages[0];
  const rows = [
    ...new Map(
      query.data?.pages.flatMap(page => page.comments).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  const submit = () => {
    const text = message.trim();
    if (!text || comment.isPending) return;
    if (pending.current?.message !== text)
      pending.current = { message: text, requestId: crypto.randomUUID() };
    comment.mutate(pending.current, {
      onSuccess: () => {
        setMessage("");
        pending.current = null;
      },
    });
  };
  return (
    <section aria-label={t("community.label")} className="flex flex-col gap-4">
      <p className="text-tau-meta text-ink-3">{t("community.identity")}</p>
      {query.isPending && <p role="status">{t("community.loading")}</p>}
      {query.isError && (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>{t("common.retry")}</Button>
        </div>
      )}
      {first && (
        <div>
          <Button
            aria-pressed={first.liked}
            variant={first.liked ? "soft" : "secondary"}
            loading={like.isPending}
            onClick={() => like.mutate(!first.liked)}
          >
            {first.liked ? t("community.unlike") : t("community.like")} · {first.likes}
          </Button>
        </div>
      )}
      {[like.error, comment.error, remove.error]
        .filter((error): error is Error => error !== null)
        .map((error, index) => (
          <p key={index} role="alert" className="text-danger text-tau-meta">
            {error.message}
          </p>
        ))}
      <form
        className="flex flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          aria-label={t("community.content")}
          placeholder={t("community.placeholder")}
          maxLength={2000}
          value={message}
          disabled={comment.isPending}
          onChange={event => setMessage(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={!message.trim()} loading={comment.isPending}>
            {t("community.post")}
          </Button>
        </div>
      </form>
      {first && !rows.length && <p className="text-ink-3">{t("community.empty")}</p>}
      {rows.length > 0 && (
        <ul aria-label={t("community.list")} className="divide-line-1 flex flex-col divide-y">
          {rows.map(row => (
            <li key={row.id} className="group flex gap-3 py-3.5">
              <span
                aria-hidden
                className={cn(
                  "text-tau-tiny grid size-7 shrink-0 place-items-center rounded-full",
                  row.canDelete
                    ? "bg-accent-soft text-accent-text font-semibold"
                    : "bg-hover text-ink-3"
                )}
              >
                {row.canDelete ? t("community.me") : t("community.anonShort")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-tau-meta text-ink-3">
                  <span className="text-ink-2 font-medium">
                    {row.canDelete ? t("community.me") : t("community.anonymous")}
                  </span>
                  <span className="mx-1.5">·</span>
                  <time dateTime={row.createdAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(row.createdAt))}
                  </time>
                </p>
                <p className="text-tau-body text-ink-1 mt-1 break-words whitespace-pre-wrap">
                  {row.message}
                </p>
              </div>
              {row.canDelete && (
                <Tooltip content={t("community.deleteOwn")}>
                  <IconButton
                    aria-label={t("community.deleteOwn")}
                    className="hover:text-danger size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={remove.isPending}
                    onClick={() => setDeletingId(row.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {t("community.more")}
        </Button>
      )}
      <ConfirmDialog
        open={!!deletingId}
        title={t("community.delete")}
        description={t("community.deleteHint")}
        confirmText={t("community.confirmDelete")}
        danger
        onOpenChange={open => {
          if (!open) setDeletingId(null);
        }}
        onConfirm={async () => {
          if (deletingId) await remove.mutateAsync(deletingId);
        }}
      />
    </section>
  );
}
