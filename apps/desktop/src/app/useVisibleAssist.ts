import { usePage } from "@/page/PageProvider";
import { useShellStore } from "./shellStore";
import { useAssistOwned } from "./assistOwner";
import { getAssistView } from "./assistViews";
import { useFeatures } from "./featureQueries";

/** 在当前页可见的视图（被页面让位时为 undefined） */
export function useShownOnPage() {
  const { state } = usePage();
  const key = state.back[state.back.length - 1]?.key;
  const ownsChat = useAssistOwned(key);
  const { isEnabled } = useFeatures();
  return (id: string | null) => {
    const view = getAssistView(id);
    if (!view || (view.feature && !isEnabled(view.feature))) return undefined;
    return view.hiddenOn?.({ key, ownsChat }) ? undefined : view;
  };
}

/** 当前应显示的视图与是否铺满正文 */
export function useVisibleAssist() {
  const shownOnPage = useShownOnPage();
  const view = shownOnPage(useShellStore(s => s.assistView));
  const expanded = useShellStore(s => s.assistExpanded);
  return { view, expanded: !!view && expanded };
}
