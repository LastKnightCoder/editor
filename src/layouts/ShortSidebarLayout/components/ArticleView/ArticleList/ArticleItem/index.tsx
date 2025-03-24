import { memo, useState } from "react";
import { Typography, App, Modal, Spin, Flex, Dropdown } from "antd";
import classnames from "classnames";
import useUploadResource from "@/hooks/useUploadResource";

// import Tags from "@/components/Tags";
import LocalImage from "@/components/LocalImage";
import useSettingStore from "@/stores/useSettingStore";
import useArticleManagementStore from "@/stores/useArticleManagementStore";

import { MdMoreVert } from "react-icons/md";
import { formatDate, getEditorTextValue } from "@/utils";
import { IArticle } from "@/types";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";
import Tags from "@/components/Tags";
import {
  getFileBaseName,
  openArticleInNewWindow,
  readBinaryFile,
  selectFile,
} from "@/commands";

interface IArticleItemProps {
  article: IArticle;
  disableOperation?: boolean;
}

const { Paragraph } = Typography;

const ArticleItem = memo((props: IArticleItemProps) => {
  const { article, disableOperation } = props;

  const [bannerUploading, setBannerUploading] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const uploadResource = useUploadResource();
  const { message } = App.useApp();

  const {
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
    activeArticleId,
    startPresentation,
  } = useArticleManagementStore((state) => ({
    updateArticleIsTop: state.updateArticleIsTop,
    deleteArticle: state.deleteArticle,
    updateArticleBannerBg: state.updateArticleBannerBg,
    activeArticleId: state.activeArticleId,
    startPresentation: state.startArticlePresentation,
  }));

  const { currentDatabaseName } = useSettingStore((state) => ({
    currentDatabaseName: state.setting.database.active,
  }));

  const isActive = activeArticleId === article.id;

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
    const fileData = await readBinaryFile(filePath[0]);
    const file = new File([fileData], await getFileBaseName(filePath[0]));
    if (file.size > 1024 * 1024 * 5) {
      message.error("文件大小超过5M");
      setBannerUploading(false);
      return;
    }
    const url = await uploadResource(file);
    if (!url) {
      message.error("上传失败");
      setBannerUploading(false);
      return;
    }
    updateArticleBannerBg?.(article.id, url || "");
    setBannerUploading(false);
  });

  const handleDeleteArticle = useMemoizedFn(() => {
    Modal.confirm({
      title: "确定删除该文章？",
      onOk: () => {
        deleteArticle(article.id);
      },
      okText: "确定",
      cancelText: "取消",
    });
    setSettingOpen(false);
  });

  const handleClickArticle = useMemoizedFn(() => {
    if (article.id === activeArticleId) {
      useArticleManagementStore.setState({
        activeArticleId: undefined,
      });
      return;
    }
    useArticleManagementStore.setState({
      activeArticleId: article.id,
    });
  });

  return (
    <div
      className={classnames(styles.articleItem, { [styles.active]: isActive })}
      onClick={handleClickArticle}
    >
      {!disableOperation && (
        <div className={styles.operate} onClick={(e) => e.stopPropagation()}>
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
                    startPresentation(article.id);
                    setSettingOpen(false);
                  },
                },
                {
                  key: "delete-article",
                  label: "删除文章",
                  onClick: handleDeleteArticle,
                },
                {
                  key: "change-banner-bg",
                  label: "换背景图",
                  onClick: () => {
                    setSettingOpen(false);
                    handleUploadFileChange();
                  },
                },
                {
                  key: "set-top",
                  label: article.isTop ? "取消置顶" : "置顶",
                  onClick: () => {
                    updateArticleIsTop(article.id, !article.isTop);
                    setSettingOpen(false);
                  },
                },
                {
                  key: "open-in-new-window",
                  label: "在新窗口中打开",
                  onClick: () => {
                    openArticleInNewWindow(currentDatabaseName, article.id);
                  },
                },
              ],
            }}
          >
            <MdMoreVert />
          </Dropdown>
        </div>
      )}
      <div className={styles.time}>
        创建于：{formatDate(article.create_time, true)}
      </div>
      <Flex align={"center"}>
        <Flex vertical gap={"small"} className={styles.contentContainer}>
          <div className={styles.title}>{article.title}</div>
          <div className={styles.content}>
            <Paragraph ellipsis={{ rows: 2 }}>
              {getEditorTextValue(article.content)}
            </Paragraph>
          </div>
        </Flex>
        <Spin spinning={bannerUploading}>
          <LocalImage
            className={styles.img}
            url={
              article.bannerBg ||
              "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
            }
          />
        </Spin>
      </Flex>
      <div className={styles.tags}>
        <Tags
          tags={article.tags}
          showIcon
          tagStyle={
            isActive ? { backgroundColor: "var(--active-icon-bg)" } : {}
          }
        />
      </div>
    </div>
  );
});

export default ArticleItem;
