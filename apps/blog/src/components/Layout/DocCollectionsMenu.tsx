import { memo, useState, useEffect, useRef } from "react";
import classNames from "classnames";
import { DocCollection } from "@blog/types";
import { joinPath } from "@blog/utils";

interface DocCollectionsMenuProps {
  collections?: DocCollection[];
  basePath: string;
  variant?: "desktop" | "mobile";
}

const DocCollectionsMenu = ({
  collections = [],
  basePath,
  variant = "desktop",
}: DocCollectionsMenuProps) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenu]);

  const normalized = collections
    .map((collection) => ({
      ...collection,
      items: collection.items?.filter(Boolean) ?? [],
    }))
    .filter((collection) => collection.items.length > 0);

  if (!normalized.length) return null;

  if (variant === "mobile") {
    return (
      <div className="flex w-full flex-col gap-3" ref={wrapperRef}>
        {normalized.map((collection) => {
          const isOpen = openMenu === collection.type;
          const hasActiveItem = collection.items.some((item) => item.active);
          return (
            <div key={collection.type} className="w-full">
              <button
                type="button"
                className={classNames(
                  "flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isOpen || hasActiveItem
                    ? "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)]"
                    : "bg-[var(--color-bg-canvas)] text-[var(--color-text-secondary)]",
                )}
                aria-expanded={isOpen}
                onClick={() =>
                  setOpenMenu((prev) =>
                    prev === collection.type ? null : collection.type,
                  )
                }
              >
                <span>{collection.label}</span>
                <svg
                  className={classNames(
                    "h-4 w-4 transition-transform duration-150",
                    isOpen && "rotate-180",
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5 pl-4">
                  {collection.items.map((item) => (
                    <a
                      key={`${collection.type}-${item.id}`}
                      href={joinPath(basePath, item.href, { raw: true })}
                      className={classNames(
                        "block rounded-lg px-3 py-2 text-sm transition-colors",
                        item.active
                          ? "text-[var(--color-text-primary)] font-medium"
                          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                      )}
                      onClick={() => setOpenMenu(null)}
                    >
                      {item.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" ref={wrapperRef}>
      {normalized.map((collection) => {
        const isOpen = openMenu === collection.type;
        const hasActiveItem = collection.items.some((item) => item.active);
        return (
          <div key={collection.type} className="dropdown">
            <button
              type="button"
              className={classNames("dropdown-trigger", {
                active: isOpen || hasActiveItem,
              })}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenMenu((prev) =>
                  prev === collection.type ? null : collection.type,
                )
              }
            >
              <span>{collection.label}</span>
              <svg
                className={classNames(
                  "h-4 w-4 transition-transform duration-150",
                  isOpen && "rotate-180",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {isOpen && (
              <div className="dropdown-menu">
                <div className="max-h-72 overflow-auto">
                  {collection.items.map((item) => (
                    <a
                      key={`${collection.type}-${item.id}`}
                      href={joinPath(basePath, item.href)}
                      className={classNames("dropdown-item", {
                        active: item.active,
                      })}
                      onClick={() => setOpenMenu(null)}
                    >
                      {item.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default memo(DocCollectionsMenu);
