import { AppWindow } from "../../app-kit/AppWindow";
import { ArticleEditorPage } from "../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../app-kit/parts/Crumbs";
import { snapshotAt } from "../tutorial/run";
import { TIMELINE } from "../tutorial/timeline";
import { TutorialDoc } from "../tutorial/TutorialDoc";

/** 文档里所有文字的字数（只用于标题下的字数统计） */
const countText = (node: unknown): number =>
  Array.isArray(node)
    ? node.reduce((n, x) => n + countText(x), 0)
    : node && typeof node === "object"
      ? Object.entries(node).reduce((n, [k, v]) => n + (k === "text" || k === "code" || k === "title" ? [...String(v)].length : countText(v)), 0)
      : 0;

/** 教程片某一章写完时的文章窗口（成型动画都已落定） */
export function TutorialChapterWindow({ chapter: id }: { chapter: string }) {
  const timing = TIMELINE.chapters.find(c => c.chapter.id === id);
  if (!timing) throw new Error(`教程片没有章节 ${id}`);
  const { chapter, run } = timing;
  const frame = run.end + 600;
  const snapshot = snapshotAt(run, frame);
  return (
    <AppWindow active="articles" crumb={<CardCrumb section="文章" title={chapter.title} />}>
      <ArticleEditorPage
        title={chapter.title}
        titleCount={99}
        timed={[]}
        frame={frame}
        words={[...chapter.title].length + countText(snapshot.doc.blocks)}
        links={0}
        tail={<TutorialDoc doc={snapshot.doc} frame={frame} typingAt={-1e9} />}
      />
    </AppWindow>
  );
}
