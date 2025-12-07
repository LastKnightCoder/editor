import { memo } from "react";

interface FooterProps {
  title: string;
}

const Footer = memo(({ title }: FooterProps) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative mt-20 overflow-hidden">
      {/* 顶部渐变装饰 */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-primary)] to-transparent" />

      {/* 背景光效 */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-canvas)] to-transparent opacity-50" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-8">
          {/* Logo 和描述 */}
          <div className="flex flex-col items-center gap-4 text-center">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-cyan-400">
                <svg
                  className="h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <span className="text-base font-semibold text-[var(--color-text-primary)]">
                {title}
              </span>
            </div>

            {/* 描述文字 */}
            <p className="max-w-md text-sm leading-relaxed text-[var(--color-text-tertiary)]">
              记录思考与成长的数字花园。在这里，每一个想法都值得被珍藏，每一次探索都通向新的可能。
            </p>
          </div>

          {/* 装饰分隔线 */}
          <div className="flex items-center gap-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[var(--color-border-primary)]" />
            <div className="flex gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] opacity-40" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] opacity-20" />
            </div>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[var(--color-border-primary)]" />
          </div>

          {/* 底部版权 */}
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-[var(--color-text-quaternary)]">
              © {currentYear} {title}. 保留所有权利
            </p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-quaternary)]">
              <span>以</span>
              <svg
                className="h-3.5 w-3.5 text-rose-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span>书写，与世界温柔对话</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
