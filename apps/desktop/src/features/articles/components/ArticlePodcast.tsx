/**
 * 文章播客区（容器）：正文顶播放条 + 生成/编辑弹窗的编排。
 * 数据流复刻 legacy usePodcastAttachment（创建/更新/删除 + 宿主重载），反馈改用
 * @tau/ui Toast（不再依赖 antd message）。
 * TODO(样式与交互重设计)：PodcastGenerationModal 为 legacy 弹窗直接搬用（2026-09-19
 * 裁决），后续按 D-011 Dialog 家族重写——迁移其内部子视图（脚本编辑/音色克隆/进度/
 * 预览）时一并处理，届时本容器只换挂载的弹窗组件。
 */

import { useState } from "react";
import type { IArticle } from "@/types";
import type { IPodcast, PodcastScriptLine, PodcastSpeaker } from "@/types/podcast";
import { findOneArticle } from "@/commands/article";
import {
  attachPodcastToArticle,
  createPodcast,
  deletePodcast,
  detachPodcastFromArticle,
  updatePodcast,
} from "@/commands/podcast";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import { ConfirmDialog, toast } from "@tau/ui";

import { PodcastPlayer } from "./PodcastPlayer";

interface ArticlePodcastProps {
  article: IArticle;
  /** 生成/编辑弹窗 open 受控——视图「更多 · 生成播客」入口打开同一弹窗 */
  modalOpen: boolean;
  onModalOpenChange: (open: boolean) => void;
  /** 保存/删除成功后回调最新文章（调用方同步本地态） */
  onUpdated: (article: IArticle) => void;
}

export function ArticlePodcast({
  article,
  modalOpen,
  onModalOpenChange,
  onUpdated,
}: ArticlePodcastProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const podcast: IPodcast | undefined = article.podcast;

  const reloadArticle = async () => {
    const updated = await findOneArticle(article.id);
    if (updated) onUpdated(updated);
  };

  const handleSuccess = async (
    audioUrl: string,
    script: string,
    scriptLines: PodcastScriptLine[],
    duration: number,
    speakers: PodcastSpeaker[],
    name?: string
  ) => {
    try {
      if (podcast) {
        await updatePodcast(podcast.id, {
          name,
          audioUrl,
          script,
          scriptLines,
          duration,
          speakers,
        });
        await reloadArticle();
        toast.success("播客已更新");
      } else {
        const created = await createPodcast({
          name,
          audioUrl,
          script,
          scriptLines,
          duration,
          speakers,
        });
        await attachPodcastToArticle(article.id, created.id);
        await reloadArticle();
        toast.success("播客已添加到文章");
      }
    } catch (error) {
      console.error("保存播客失败:", error);
      toast.error("保存播客失败");
    }
  };

  const handleDelete = async () => {
    if (!podcast) return;
    setDeleting(true);
    try {
      await detachPodcastFromArticle(article.id);
      await deletePodcast(podcast.id);
      await reloadArticle();
      setConfirmOpen(false);
      toast.success("播客已删除");
    } catch (error) {
      console.error("删除播客失败:", error);
      toast.error("删除播客失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {podcast && (
        <PodcastPlayer
          podcast={podcast}
          onEdit={() => onModalOpenChange(true)}
          onDelete={() => setConfirmOpen(true)}
        />
      )}

      {/* legacy 弹窗直接搬用（见文件头 TODO）：保存成功后由弹窗自行关闭 */}
      <PodcastGenerationModal
        open={modalOpen}
        cardContent={article.content}
        initialPodcast={podcast}
        onSuccess={handleSuccess}
        onCancel={() => onModalOpenChange(false)}
        saveText="保存到文章"
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={open => {
          if (!open) setConfirmOpen(false);
        }}
        title="删除播客"
        context={podcast?.name || "未命名播客"}
        description="将从文章移除并删除音频与脚本。"
        impact="生成记录不可恢复，重新生成需再次调用语音服务"
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
