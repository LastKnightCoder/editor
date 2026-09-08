import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import { Dropdown, App, message } from "antd";
import type { MenuProps } from "antd";
import { useCreation, useMemoizedFn } from "ahooks";
import { LoadingOutlined, PushpinOutlined } from "@ant-design/icons";

import For from "@/components/For";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";

import { IArticle } from "@/types";
import { TabType } from "@/types/tab";
import {
  getAllArticles,
  deleteArticle,
  updateArticleIsTop,
  openArticleInNewWindow,
} from "@/commands";
import { isElectron } from "@/electron";
import useTabStore from "@/stores/useTabStore";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { defaultArticleEventBus, getMarkdown, downloadMarkdown } from "@/utils";

import styles from "./index.module.less";

interface SimpleArticleListProps {
  activeArticleId: number;
  className?: string;
  style?: React.CSSProperties;
}

const SimpleArticleList = (props: SimpleArticleListProps) => {
  const { className, style, activeArticleId } = props;
  const { hoverClass, activeClass } = useThemeColors();
  const { modal } = App.useApp();

  const [articles, setArticles] = useState<IArticle[]>([]);
  const navigateTo = useTabStore(state => state.navigateTo);
  const [loading, setLoading] = useState(false);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<IArticle | null>(null);

  const currentDatabaseName = useSettingStore(useShallow(state => state.setting.database.active));
  const articleEventBus = useCreation(() => defaultArticleEventBus.createEditor(), []);

  useEffect(() => {
    setLoading(true);
    getAllArticles()
      .then(articles => {
        setArticles(articles);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const unsubUpdated = defaultArticleEventBus.subscribe("article:updated", data => {
      setArticles(prevArticles =>
        prevArticles.map(article => (article.id === data.article.id ? data.article : article))
      );
    });

    const unsubDeleted = defaultArticleEventBus.subscribe("article:deleted", data => {
      setArticles(prev => prev.filter(a => a.id !== data.article.id));
    });

    const unsubTopChanged = defaultArticleEventBus.subscribe("article:top-changed", data => {
      setArticles(prev => prev.map(a => (a.id === data.article.id ? data.article : a)));
    });

    return () => {
      unsubUpdated();
      unsubDeleted();
      unsubTopChanged();
    };
  }, []);

  const onClick = (article: IArticle) => {
    if (activeArticleId === article.id) {
      navigateTo(TabType.ArticleList);
      return;
    }
    navigateTo(
      TabType.ArticleDetail,
      { id: article.id },
      `文章 - ${article.title || `#${article.id}`}`
    );
  };

  const handleToggleTop = useMemoizedFn(async (article: IArticle) => {
    const updated = await updateArticleIsTop(article.id, !article.isTop);
    setArticles(prev => prev.map(a => (a.id === updated.id ? updated : a)));
    articleEventBus.publishArticleEvent("article:top-changed", updated);
  });

  const handleDelete = useMemoizedFn((article: IArticle) => {
    modal.confirm({
      title: "确定删除该文章？",
      onOk: async () => {
        await deleteArticle(article.id);
        setArticles(prev => prev.filter(a => a.id !== article.id));
        articleEventBus.publishArticleEvent("article:deleted", article);
        message.success("删除成功");
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
    });
  });

  const handleExportMarkdown = useMemoizedFn((article: IArticle) => {
    const markdown = getMarkdown(article.content);
    downloadMarkdown(markdown, article.title);
  });

  const handleOpenInNewWindow = useMemoizedFn((article: IArticle) => {
    openArticleInNewWindow(currentDatabaseName, article.id);
  });

  const getMenuItems = useMemoizedFn((article: IArticle): MenuProps["items"] => [
    {
      key: "set-top",
      label: article.isTop ? "取消置顶" : "置顶",
      onClick: () => handleToggleTop(article),
    },
    {
      key: "export",
      label: "导出文章",
      children: [
        {
          key: "export-markdown",
          label: "Markdown",
          onClick: () => handleExportMarkdown(article),
        },
        {
          key: "export-image",
          label: "图片",
          onClick: () => {
            setSelectedArticle(article);
            setExportModalOpen(true);
          },
        },
        {
          key: "export-epub",
          label: "EPUB",
          onClick: () => {
            setSelectedArticle(article);
            setEpubExportModalOpen(true);
          },
        },
        {
          key: "export-pdf",
          label: "PDF",
          onClick: () => {
            setSelectedArticle(article);
            setPdfExportModalOpen(true);
          },
        },
      ],
    },
    // 独立窗口为 Electron 专属能力，Web 端不展示入口
    ...(isElectron
      ? [
          {
            key: "open-in-new-window",
            label: "窗口打开",
            onClick: () => handleOpenInNewWindow(article),
          },
        ]
      : []),
    { type: "divider" },
    {
      key: "delete-article",
      label: "删除文章",
      danger: true,
      onClick: () => handleDelete(article),
    },
  ]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined style={{ fontSize: 24 }} spin />
      </div>
    );
  }

  return (
    <div
      className={classnames(
        styles.container,
        "border-r border-[#f0f0f0] dark:border-[#2a2a2a]",
        className
      )}
      style={style}
    >
      <div className={styles.header}>
        <div className={styles.title}>文章列表({articles.length})</div>
      </div>
      <div className={styles.divider}></div>
      <div className={styles.list}>
        <For
          data={articles}
          renderItem={article => (
            <Dropdown
              key={article.id}
              trigger={["contextMenu"]}
              menu={{ items: getMenuItems(article) }}
            >
              <div
                className={classnames(
                  styles.item,
                  article.id === activeArticleId ? activeClass : hoverClass
                )}
                onClick={() => onClick(article)}
              >
                {article.isTop && <PushpinOutlined style={{ marginRight: 4, fontSize: 12 }} />}
                {article.title}
              </div>
            </Dropdown>
          )}
        />
      </div>

      {selectedArticle && (
        <>
          <ContentExportModal
            open={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            content={selectedArticle.content}
            title={selectedArticle.title}
          />
          <EpubExportModal
            open={epubExportModalOpen}
            onClose={() => setEpubExportModalOpen(false)}
            content={selectedArticle.content}
            title={selectedArticle.title || `文章 #${selectedArticle.id}`}
          />
          <PdfExportModal
            visible={pdfExportModalOpen}
            onClose={() => setPdfExportModalOpen(false)}
            content={selectedArticle.content}
            title={selectedArticle.title || `文章 #${selectedArticle.id}`}
          />
        </>
      )}
    </div>
  );
};

export default SimpleArticleList;
