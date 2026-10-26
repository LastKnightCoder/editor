import type { DocCollection, DocEntry } from "./collection.ts";
import { navigate } from "./router.ts";

interface DocsNavProps {
  collection: DocCollection;
  current: DocEntry;
  onNavigate?: () => void;
}

export function DocsNav({ collection, current, onNavigate }: DocsNavProps) {
  return (
    <nav aria-label="文档目录" className="flex flex-col gap-6 text-[14px]">
      {collection.groups.map(group => (
        <div key={group.title}>
          <p className="text-ink-3 mb-1.5 px-3 text-[12px] font-medium tracking-[0.12em]">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items
              .filter(entry => !entry.hidden)
              .map(entry => (
                <li key={entry.slug}>
                  <a
                    href={collection.href(entry.slug)}
                    aria-current={entry === current ? "page" : undefined}
                    onClick={event => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                        return;
                      event.preventDefault();
                      navigate(collection.href(entry.slug));
                      onNavigate?.();
                    }}
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 aria-[current=page]:bg-selected aria-[current=page]:text-accent-text block rounded-[8px] px-3 py-1.5 transition-colors aria-[current=page]:font-medium"
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
