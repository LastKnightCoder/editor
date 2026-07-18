import React, { useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import { Dropdown, message, Spin, Typography, App } from "antd";
import SVG from "react-inlinesvg";
import { CalendarOutlined } from "@ant-design/icons";
import star from "@/assets/article/star.svg";
import { MdMoreVert } from "react-icons/md";

import LocalImage from "@/components/LocalImage";
import { Editor, EditorRef } from "@tau/editor/src";
import Tags from "@/components/Tags";
import If from "@/components/If";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";

import { useCreation, useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import { IArticle } from "@/types";

import { formatDate, getMarkdown, downloadMarkdown } from "@/utils";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import styles from "./index.module.less";
import {
  getFileBaseName,
  readBinaryFile,
  selectFile,
  openArticleInNewWindow,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import useEditContent from "@/hooks/useEditContent";

const { Text } = Typography;

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
  disableOperation?: boolean;
  updateArticleBannerBg?: (id: number, bannerBg: string) => Promise<void>;
  updateArticleIsTop?: (id: number, isTop: boolean) => Promise<void>;
  deleteArticle?: (id: number) => Promise<void>;
}

const allThemes = [
  styles.green,
  styles.blue,
  styles.red,
  styles.yellow,
  styles.purple,
];

const ArticleCard = (props: IArticleCardProps) => {
  const {
    article,
    className,
    style,
    imageRight,
    disableOperation,
    updateArticleBannerBg,
    updateArticleIsTop,
    deleteArticle,
  } = props;

  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );

  const { isDark } = useTheme();
  const navigateTo = useTabStore((state) => state.navigateTo);
  const [settingOpen, setSettingOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const { modal } = App.useApp();
  const uploadResource = useUploadResource();

  const randomTheme = allThemes[article.id % allThemes.length];
  const cardClassName = classnames(styles.articleCard, randomTheme, {
    [styles.right]: imageRight,
    [styles.dark]: isDark,
  });

  const { startPresentation } = useArticleManagementStore(
    useShallow((state) => ({
      startPresentation: state.startArticlePresentation,
    })),
  );

  useEditContent(article.contentId, (content) => {
    editorRef.current?.setEditorValue(content.slice(0, 1));
  });

  const currentDatabaseName = useSettingStore(
    useShallow((state) => state.setting.database.active),
  );

  const handleUploadFileChange = useMemoizedFn(async () => {
    const filePath = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "Image",
          extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"],
        },
      ],
    });
    if (!filePath || (Array.isArray(filePath) && filePath.length !== 1)) {
      setBannerUploading(false);
      return;
    }
    const fileData = (await readBinaryFile(
      filePath[0],
    )) as Uint8Array<ArrayBuffer>;
    const file = new File([fileData], await getFileBaseName(filePath[0]));
    const url = await uploadResource(file);
    if (!url) {
      message.error("上传失败");
      setBannerUploading(false);
      return;
    }
    updateArticleBannerBg?.(article.id, url || "");
    setBannerUploading(false);
    articleEventBus.publishArticleEvent("article:updated", {
      ...article,
      bannerBg: url || "",
    });
  });

  const handleDeleteArticle = useMemoizedFn(() => {
    modal.confirm({
      title: "确定删除该文章？",
      onOk: async () => {
        if (deleteArticle) {
          await deleteArticle(article.id);
          articleEventBus.publishArticleEvent("article:deleted", article);
          message.success("删除成功");
        }
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
    setSettingOpen(false);
  });

  const handleClickArticle = useMemoizedFn(() => {
    navigateTo(
      TabType.ArticleDetail,
      { id: article.id },
      `文章 - ${article.title || `#${article.id}`}`,
    );
  });

  const handleEdit = () => {
    setSettingOpen(false);
    handleUploadFileChange();
  };

  return (
    <div className={classnames(styles.cardContainer, className)}>
      <Spin spinning={bannerUploading}>
        <div className={cardClassName} style={style}>
          <div
            className={classnames(styles.imageContainer, {
              [styles.right]: imageRight,
            })}
            onClick={handleClickArticle}
          >
            <LocalImage
              url={
                article.bannerBg ||
                "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
              }
            />
            <If condition={article.isTop}>
              <SVG src={star} className={styles.topStar} />
            </If>
          </div>
          <div className={styles.content}>
            {!disableOperation && (
              <div
                className={classnames(styles.operate, {
                  [styles.left]: imageRight,
                })}
              >
                <Dropdown
                  open={settingOpen}
                  onOpenChange={setSettingOpen}
                  placement={"bottomRight"}
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "presentation-mode",
                        label: "演示模式",
                        onClick: () => {
                          startPresentation(article);
                          setSettingOpen(false);
                        },
                      },
                      {
                        key: "export",
                        label: "导出文章",
                        children: [
                          {
                            key: "export-markdown",
                            label: "Markdown",
                            onClick: () => {
                              const markdown = getMarkdown(article.content);
                              downloadMarkdown(markdown, article.title);
                              setSettingOpen(false);
                            },
                          },
                          {
                            key: "export-image",
                            label: "图片",
                            onClick: () => {
                              setExportModalOpen(true);
                              setSettingOpen(false);
                            },
                          },
                          {
                            key: "export-epub",
                            label: "EPUB",
                            onClick: () => {
                              setEpubExportModalOpen(true);
                              setSettingOpen(false);
                            },
                          },
                          {
                            key: "export-pdf",
                            label: "PDF",
                            onClick: () => {
                              setPdfExportModalOpen(true);
                              setSettingOpen(false);
                            },
                          },
                        ],
                      },
                      {
                        key: "delete-article",
                        label: "删除文章",
                        onClick: handleDeleteArticle,
                      },
                      {
                        key: "change-banner-bg",
                        label: "换背景图",
                        onClick: handleEdit,
                      },
                      {
                        key: "set-top",
                        label: article.isTop ? "取消置顶" : "设置置顶",
                        onClick: () => {
                          updateArticleIsTop?.(article.id, !article.isTop);
                          setSettingOpen(false);
                        },
                      },
                      {
                        key: "open-in-new-window",
                        label: "窗口打开",
                        onClick: () => {
                          openArticleInNewWindow(
                            currentDatabaseName,
                            article.id,
                          );
                        },
                      },
                    ],
                  }}
                >
                  <MdMoreVert />
                </Dropdown>
              </div>
            )}
            <div onClick={handleClickArticle}>
              <Text
                className={styles.title}
                ellipsis={{ tooltip: article.title }}
              >
                {article.title}
              </Text>
            </div>
            <div className={styles.timeAndTags}>
              <div className={styles.time}>
                <CalendarOutlined />
                <span className={styles.date}>
                  发表于：{formatDate(article.create_time, true)}
                </span>
              </div>
            </div>
            <div>
              <Tags tags={article.tags} showIcon />
            </div>
            <Editor
              className={styles.editor}
              ref={editorRef}
              initValue={article.content.slice(0, 1)}
              readonly
            />
          </div>
        </div>
      </Spin>

      <ContentExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        content={article.content}
        title={article.title}
      />
      <EpubExportModal
        open={epubExportModalOpen}
        onClose={() => setEpubExportModalOpen(false)}
        content={article.content}
        title={article.title || `文章 #${article.id}`}
      />
      <PdfExportModal
        visible={pdfExportModalOpen}
        onClose={() => setPdfExportModalOpen(false)}
        content={article.content}
        title={article.title || `文章 #${article.id}`}
      />
    </div>
  );
};

export default ArticleCard;
