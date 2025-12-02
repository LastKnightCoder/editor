import { memo } from "react";

interface FooterProps {
  title: string;
}

const Footer = memo(({ title }: FooterProps) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-canvas)]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-[var(--color-text-secondary)]">
            © {currentYear} {title}. All rights reserved.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Powered by{" "}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Tau
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
