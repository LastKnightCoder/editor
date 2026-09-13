// 详情页 ⋯ 菜单的协作项工厂：有绑定时「查看协作」（进协作编辑页，成员视角/完整协作视图），
// 否则「发起协作」。卡片 / 文章 / 知识库 / 项目文档四类详情页共用，避免菜单分支各写一份。
import { UserCheck, UserPlus } from "lucide-react";
import type { ActionSheetItem } from "../../components/ActionSheet";
import type { CollaborationBinding } from "../../types";

export function collabMenuItems(options: {
  contentId?: number | null;
  binding: CollaborationBinding | null;
  onStartShare: () => void;
  onOpenBinding: (documentId: string) => void;
}): ActionSheetItem[] {
  const { contentId, binding } = options;
  if (binding) {
    return [
      {
        label: "查看协作",
        icon: <UserCheck size={18} />,
        tone: "apricot",
        onClick: () => options.onOpenBinding(binding.documentId),
      },
    ];
  }
  if (!contentId || contentId <= 0) {
    return [];
  }
  return [
    {
      label: "发起协作",
      icon: <UserPlus size={18} />,
      tone: "apricot",
      onClick: options.onStartShare,
    },
  ];
}

export default collabMenuItems;
