// 宿主详情页的协作接入统一封装（文章/卡片/知识库/项目文档四类详情页共用）：
// 绑定查询与刷新（onResume / 共享结束 / 面板关闭）、发起协作面板（懒加载）、
// ⋯ 菜单协作项、结束后回调——原先每页五件套手写、文案与接线易漂移。
import { lazy, Suspense, useState } from "react";
import { useAppContext } from "../../app/AppContext";
import { useNavigator, usePageLifecycle } from "../../router";
import { collabMenuItems } from "./collabMenuItems";
import { useContentCollabBinding } from "./useContentCollabBinding";

const ShareContentSheet = lazy(() =>
  import("./ShareContentSheet").then(module => ({ default: module.ShareContentSheet }))
);

export function useContentCollabEntry(
  contentId: number | undefined,
  options?: {
    /** 页面级刷新源（宿主自身的 refreshKey），与内部 onResume / 结束计数叠加 */
    refreshKey?: number;
    /** 发起面板所需的业务字段（各页来源不同：标题 / 正文 / 来源类型）；
     *  无发起入口的宿主（contentId 直入）可省略 */
    share?: {
      title: string;
      content?: unknown[];
      bannerBg?: string;
      bannerPosition?: string;
      sourceType?: string;
      sourceId?: number;
    };
  }
) {
  const navigator = useNavigator();
  const app = useAppContext();
  const [shareOpen, setShareOpen] = useState(false);
  // onResume 重查协作绑定：下层协作页结束共享/投影变更后回本页保持状态最新
  const [resumeRev, setResumeRev] = useState(0);
  const [endedRev, setEndedRev] = useState(0);
  usePageLifecycle({ onResume: () => setResumeRev(value => value + 1) });
  const binding = useContentCollabBinding(
    contentId,
    (options?.refreshKey ?? 0) + resumeRev + endedRev
  );

  return {
    binding,
    /** 传给 ContentDetailPage 的 collaboration prop */
    collaboration: binding ? { documentId: binding.documentId } : undefined,
    /** 共享结束（或发起面板关闭）后刷新绑定 */
    onCollaborationEnded: () => setEndedRev(value => value + 1),
    /** ⋯ 菜单中的协作项（有绑定 → 查看协作；无 → 发起协作） */
    menuItems: collabMenuItems({
      contentId,
      binding,
      onStartShare: () => setShareOpen(true),
      onOpenBinding: documentId => navigator.push("collabEditor", { documentId }),
    }),
    /** 发起协作面板（懒加载，含未使用协作用户的不加载），渲染在页面根部 */
    shareSheet: (
      <Suspense fallback={null}>
        <ShareContentSheet
          open={shareOpen}
          contentId={contentId ?? 0}
          title={options?.share?.title ?? ""}
          content={options?.share?.content}
          bannerBg={options?.share?.bannerBg}
          bannerPosition={options?.share?.bannerPosition}
          sourceType={options?.share?.sourceType}
          sourceId={options?.share?.sourceId}
          onClose={() => {
            setShareOpen(false);
            setEndedRev(value => value + 1);
          }}
          onError={(error, fallback) => app.presentError(error, fallback)}
        />
      </Suspense>
    ),
  };
}
