import React, { useState, useRef } from 'react';
import classnames from "classnames";
import { message, Modal, Popover, Spin, Typography } from 'antd';
import SVG from 'react-inlinesvg';
import { CalendarOutlined } from '@ant-design/icons';
import star from '@/assets/article/star.svg';
import { MdMoreVert } from 'react-icons/md';

import LocalImage from "@editor/components/LocalImage";
import Editor from "@editor/index.tsx";
import Tags from "@/components/Tags";
import If from "@/components/If";

import { useMemoizedFn } from "ahooks";
import useTheme from "@/hooks/useTheme.ts";
import useUploadImage from "@/hooks/useUploadImage.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import { IArticle } from "@/types";

import styles from './index.module.less';
import { formatDate } from "@/utils";

const { Text } = Typography;

interface IArticleCardProps {
  article: IArticle;
  className?: string;
  style?: React.CSSProperties;
  imageRight?: boolean;
}

const allThemes = [styles.green, styles.blue, styles.red, styles.yellow, styles.purple];

const ArticleCard = (props: IArticleCardProps) => {
  const {
    article,
    className,
    style,
    imageRight,
  } = props;

  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const uploadImage = useUploadImage();

  const randomTheme = allThemes[article.id % allThemes.length];
  const cardClassName = classnames(
    styles.articleCard,
    randomTheme,
    {
      [styles.right]: imageRight,
      [styles.dark]: isDark,
    },
  )

  const {
    updateArticleIsTop,
    deleteArticle,
    updateArticleBannerBg,
    activeArticleId
  } = useArticleManagementStore((state) => ({
    updateArticleIsTop: state.updateArticleIsTop,
    deleteArticle: state.deleteArticle,
    updateArticleBannerBg: state.updateArticleBannerBg,
    activeArticleId: state.activeArticleId
  }));

  const handleUploadFileChange = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBannerUploading(true);
    const files = event.target.files;
    if (!files) {
      setBannerUploading(false);
      return;
    }
    const file = files[0];
    if (file.size > 1024 * 1024 * 5) {
      message.error('文件大小超过5M');
      setBannerUploading(false);
      return;
    }
    const url = await uploadImage(file);
    if (!url) {
      message.error('上传失败');
      setBannerUploading(false);
      return;
    }
    await updateArticleBannerBg(article.id, url || '');
    setBannerUploading(false);
  })

  const handleDeleteArticle = useMemoizedFn(() => {
    Modal.confirm({
      title: '确定删除该文章？',
      onOk: async () => {
        await deleteArticle(article.id);
      },
      okText: '确定',
      cancelText: '取消',
    });
    setSettingOpen(false);
  })

  const handleClickArticle = useMemoizedFn(() => {
    if (article.id === activeArticleId) {
      useArticleManagementStore.setState({
        activeArticleId: undefined
      });
      return;
    }
    useArticleManagementStore.setState({
      activeArticleId: article.id
    });
  })

  return (
    <div className={classnames(styles.cardContainer, className)}>
      <Spin spinning={bannerUploading}>
        <div className={cardClassName} style={style}>
          <div className={classnames(styles.imageContainer, { [styles.right]: imageRight })} onClick={handleClickArticle}>
            <LocalImage url={article.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'} />
            <If condition={article.isTop}>
              <SVG src={star} className={styles.topStar} />
            </If>
          </div>
          <div className={styles.content}>
            <div className={classnames(styles.operate, { [styles.left]: imageRight } )}>
              <Popover
                open={settingOpen}
                onOpenChange={setSettingOpen}
                placement={'bottomRight'}
                trigger={'click'}
                overlayInnerStyle={{
                  padding: 4,
                }}
                content={(
                  <div className={styles.settings}>
                    <div
                      className={styles.settingItem}
                      onClick={async () => {
                        await updateArticleIsTop(article.id, !article.isTop);
                        setSettingOpen(false)
                      }}
                    >
                      { article.isTop ? '取消置顶' : '置顶文章' }
                    </div>
                    <div className={styles.settingItem} onClick={handleDeleteArticle}>删除文章</div>
                    <div
                      className={styles.settingItem}
                      onClick={() => {
                        setSettingOpen(false);
                        fileUploadRef.current?.click();
                      }}
                    >
                      换背景图
                    </div>
                    <input
                      ref={fileUploadRef}
                      type={'file'}
                      accept={'image/*'}
                      style={{ display: 'none' }}
                      onChange={handleUploadFileChange}
                    />
                  </div>
                )}
              >
                <MdMoreVert />
              </Popover>
            </div>
            <div onClick={handleClickArticle}>
              <Text className={styles.title} ellipsis={{ tooltip: article.title }}>
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
              initValue={article.content.slice(0, 1)}
              readonly
            />
          </div>
        </div>
      </Spin>
    </div>
  )
}

export default ArticleCard;