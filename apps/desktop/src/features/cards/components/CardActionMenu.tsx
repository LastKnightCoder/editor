/**
 * 卡片条目操作菜单（⋯）：卡面 CardItemView 与预览 CardPreviewDialog 共用的
 * 单一实现，替代两处重复维护的等价菜单。菜单项 = 窗口打开（Electron）/ 置顶 /
 * 进入详情（可选）/ 演示模式 / 导出×4 / 编辑分类 / 删除；两处消费的差异经
 * props 表达——预览在菜单内提供「进入详情」且演示前需落盘并收起弹窗。
 */

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Download,
  ExternalLink,
  FileType,
  FileText,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Pin,
  Play,
  Trash2,
} from "lucide-react";
import type { ReactElement } from "react";
import type { ECardCategory, ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { Menu } from "@tau/ui/Menu";
import { CATEGORY_COLORS } from "../categoryColors";
import type { CardItemActions } from "../types";

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

export interface CardActionMenuProps {
  card: ICard;
  actions: CardItemActions;
  /** 菜单触发器（两处消费的图标按钮尺寸不同，由调用方给定） */
  trigger: ReactElement;
  /** 「进入详情」菜单项（渲染在置顶之后）：预览在菜单内提供，卡面走独立图标按钮不传 */
  detailItem?: { onSelect(): void };
  /** 演示前置动作：预览需先落盘正文并收起弹窗；未传则直呼 onPresent */
  onBeforePresent?: () => Promise<void> | void;
}

export function CardActionMenu({
  card,
  actions,
  trigger,
  detailItem,
  onBeforePresent,
}: CardActionMenuProps) {
  return (
    <Menu align="end" trigger={trigger}>
      {actions.onOpenWindow && (
        <Menu.Item
          onSelect={() => actions.onOpenWindow?.(card)}
          icon={<MenuIcon icon={ExternalLink} />}
        >
          窗口打开
        </Menu.Item>
      )}
      <Menu.Item onSelect={() => actions.onToggleTop(card)} icon={<MenuIcon icon={Pin} />}>
        {card.isTop ? "取消置顶" : "设置置顶"}
      </Menu.Item>
      {detailItem && (
        <Menu.Item onSelect={detailItem.onSelect} icon={<MenuIcon icon={Maximize2} />}>
          进入详情
        </Menu.Item>
      )}
      <Menu.Item
        onSelect={() => {
          void (async () => {
            await onBeforePresent?.();
            actions.onPresent(card);
          })().catch(() => {});
        }}
        icon={<MenuIcon icon={Play} />}
      >
        演示模式
      </Menu.Item>
      <Menu.Submenu label="导出" icon={<MenuIcon icon={Download} />}>
        <Menu.Item
          onSelect={() => actions.onExportMarkdown(card)}
          icon={<MenuIcon icon={FileText} />}
        >
          Markdown
        </Menu.Item>
        <Menu.Item
          onSelect={() => actions.onExportImage(card)}
          icon={<MenuIcon icon={ImageIcon} />}
        >
          图片
        </Menu.Item>
        <Menu.Item onSelect={() => actions.onExportEpub(card)} icon={<MenuIcon icon={BookOpen} />}>
          EPUB
        </Menu.Item>
        <Menu.Item onSelect={() => actions.onExportPdf(card)} icon={<MenuIcon icon={FileType} />}>
          PDF
        </Menu.Item>
      </Menu.Submenu>
      <Menu.Submenu label="编辑分类" icon={<MenuIcon icon={Layers} />}>
        {(Object.keys(cardCategoryName) as ECardCategory[]).map(key => (
          <Menu.Item
            key={key}
            disabled={card.category === key}
            onSelect={() => actions.onChangeCategory(card, key)}
            icon={
              <span
                className="size-[7px] shrink-0 rounded-full"
                style={{ background: CATEGORY_COLORS[key].text }}
              />
            }
          >
            {cardCategoryName[key]}
          </Menu.Item>
        ))}
      </Menu.Submenu>
      <Menu.Separator />
      <Menu.Item danger onSelect={() => actions.onDelete(card)} icon={<MenuIcon icon={Trash2} />}>
        删除卡片
      </Menu.Item>
    </Menu>
  );
}
