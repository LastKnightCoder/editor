import appIconSrc from "../assets/app-icon.png";

type HeaderProps = {
  title?: string;
  rightAction?: React.ReactNode;
};

export function Header({ title = "卡片", rightAction }: HeaderProps) {
  return (
    <header className="mobile-topbar sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 backdrop-blur-sm dark:border-neutral-900 dark:bg-black/95">
      <div className="h-10 w-10" />

      <h1 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
        {title}
      </h1>

      <div className="flex h-10 w-10 items-center justify-center">
        {rightAction ?? (
          <img
            src={appIconSrc}
            alt="Tau"
            className="h-7 w-7 rounded-lg object-cover"
          />
        )}
      </div>
    </header>
  );
}

export default Header;
