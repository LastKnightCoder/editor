import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Layers,
  MessagesSquare,
  PackagePlus,
  Puzzle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button, cn } from "@tau/ui";
import { useSubmissionCounts } from "../features/submissions/queries";

function Item({
  to,
  icon: Icon,
  children,
  hint,
  end,
}: {
  to: string;
  icon: LucideIcon;
  children: ReactNode;
  hint?: ReactNode;
  /** 有子路由的入口需精确匹配，避免与子页入口同时高亮 */
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "text-tau-body rounded-tau-sm flex items-center gap-2.5 px-2.5 py-[7px] transition-colors",
          isActive
            ? "bg-selected text-accent-text font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )
      }
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      {children}
      {hint && <span className="text-tau-micro ml-auto">{hint}</span>}
    </NavLink>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-tau-micro text-ink-3 px-2.5 pb-1">{title}</p>
      {children}
    </div>
  );
}

/** 工作台侧栏：作者入口常驻，管理入口只给审核者 */
export function WorkspaceSidebar({ reviewer }: { reviewer: boolean }) {
  const navigate = useNavigate();
  const mine = useSubmissionCounts("mine");
  const review = useSubmissionCounts("review", reviewer);
  const needsWork = mine.data?.changes_requested ?? 0;
  const pending = review.data?.pending_review ?? 0;
  return (
    <aside className="border-line-1 sticky top-14 flex h-[calc(100vh-56px)] w-[220px] shrink-0 flex-col gap-5 border-r px-3 py-5">
      <Button
        variant="primary"
        block
        icon={PackagePlus}
        onClick={() => navigate("/submissions/new")}
      >
        发布新插件
      </Button>
      <Group title="我的">
        <Item
          to="/submissions"
          icon={Layers}
          hint={
            needsWork > 0 && (
              <span className="text-accent-text font-semibold">{needsWork} 需修改</span>
            )
          }
        >
          我的提交
        </Item>
      </Group>
      {reviewer && (
        <Group title="管理员">
          <Item
            to="/review"
            icon={ShieldCheck}
            hint={pending > 0 && <span className="text-accent-text font-semibold">{pending}</span>}
          >
            审核队列
          </Item>
          <Item to="/moderation/plugins" icon={Puzzle}>
            插件管理
          </Item>
          <Item to="/moderation" icon={MessagesSquare} end>
            评论管理
          </Item>
        </Group>
      )}
      <p className="text-tau-micro text-ink-3 mt-auto px-2.5 leading-[1.6]">
        插件的名称、简介和说明都读自插件包；要修改，请重新打包上传。
      </p>
    </aside>
  );
}
