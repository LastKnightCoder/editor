import { memo } from "react";

interface FooterProps {
  title: string;
}

const Footer = memo(({ title }: FooterProps) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="mt-24"
      style={{ boxShadow: "0 -1px 0 0 var(--color-border-ring)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          &copy; {currentYear} {title}
        </p>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
