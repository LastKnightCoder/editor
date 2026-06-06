import { memo } from "react";
import { motion } from "motion/react";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { getInitData, formatDate, joinPath, truncate } from "@blog/utils";
import { HomeData } from "@blog/types";
import {
  fadeUp,
  staggerContainer,
  defaultTransition,
  charReveal,
  charContainer,
  heroTransition,
} from "@blog/utils/motion";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const HOME_RECENT_ITEM_MAX_LENGTH = 36;

const HomePage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const content = initData.content as HomeData;
  const docCollections = initData.docCollections || [];

  const desktopDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu
        collections={docCollections}
        basePath={site.basePath}
        variant="desktop"
      />
    ) : undefined;
  const mobileDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu
        collections={docCollections}
        basePath={site.basePath}
        variant="mobile"
      />
    ) : undefined;
  const docEntryLinks = docCollections
    .filter((collection) => collection.items && collection.items.length > 0)
    .map((collection) => ({
      label: collection.label,
      href: collection.items[0].href,
    }));

  const recentItems = content.timeline.slice(0, 6);
  const titleChars = content.hero?.title.split("") ?? [];

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
        rssHref={initData.rss?.href}
      />

      <main className="flex min-h-0 flex-1 items-stretch px-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 items-center gap-12 lg:gap-20">
          {/* 左栏：Hero + 逐字揭幕 */}
          {content.hero && (
            <div className="flex min-w-0 flex-1 flex-col justify-center py-12">
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...heroTransition, duration: 0.5 }}
                className="mb-5 text-xs font-medium tracking-[0.25em] uppercase text-[var(--color-text-tertiary)]"
              >
                Welcome to my digital garden
              </motion.p>

              <motion.h1
                variants={charContainer}
                initial="hidden"
                animate="visible"
                className="flex flex-wrap items-center font-bold text-[var(--color-text-primary)]"
                style={{
                  fontSize: "clamp(2.5rem, 6vw, 5rem)",
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                }}
              >
                {titleChars.map((char, i) => (
                  <span key={i} className="inline-block overflow-hidden">
                    <motion.span
                      className="inline-block"
                      variants={charReveal}
                      transition={{
                        duration: 0.6,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {char}
                    </motion.span>
                  </span>
                ))}
              </motion.h1>

              <motion.div
                className="mt-5 h-px w-12 bg-[var(--color-border-ring-heavy)]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.8,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.8,
                }}
                style={{ transformOrigin: "left" }}
              />

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...heroTransition, delay: 0.9 }}
                className="mt-5 max-w-md text-base leading-[1.9] text-[var(--color-text-secondary)]"
              >
                {content.hero.description}
              </motion.p>

              <motion.nav
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...heroTransition, delay: 1.1 }}
                className="mt-8 flex flex-wrap gap-x-6 gap-y-2"
              >
                <a
                  href={joinPath(site.basePath, "/articles")}
                  className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  文章
                </a>
                <a
                  href={joinPath(site.basePath, "/cards")}
                  className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  卡片
                </a>
                {docEntryLinks.length > 0
                  ? docEntryLinks.map((entry) => (
                      <a
                        key={entry.label}
                        href={joinPath(site.basePath, entry.href)}
                        className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        {entry.label}
                      </a>
                    ))
                  : null}
                {docCollections.length === 0 && (
                  <a
                    href={joinPath(site.basePath, "/docs")}
                    className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    文档
                  </a>
                )}
              </motion.nav>
            </div>
          )}

          {/* 右栏：最近更新 */}
          {recentItems.length > 0 && (
            <motion.div
              className="hidden w-80 shrink-0 flex-col justify-center py-12 lg:flex xl:w-96"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              transition={{ delayChildren: 1.3, staggerChildren: 0.06 }}
            >
              <motion.p
                variants={fadeUp}
                transition={defaultTransition}
                className="mb-6 text-xs font-medium tracking-[0.2em] text-[var(--color-text-tertiary)] uppercase"
              >
                最近更新
              </motion.p>

              <div>
                {recentItems.map((item) => (
                  <motion.a
                    key={`${item.type}-${item.id}`}
                    href={joinPath(site.basePath, item.href)}
                    variants={fadeUp}
                    transition={defaultTransition}
                    className="group grid grid-cols-[5rem_1fr] items-baseline gap-4 rounded-lg py-3 transition-colors sm:px-3 sm:-mx-3 hover:bg-[var(--color-bg-canvas)]"
                  >
                    <span className="text-xs tabular-nums text-[var(--color-text-tertiary)]">
                      {formatDate(item.publishTime, "short")}
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)] truncate">
                      {truncate(
                        item.title || item.summary,
                        HOME_RECENT_ITEM_MAX_LENGTH,
                      )}
                    </span>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
});

HomePage.displayName = "HomePage";

export default HomePage;
