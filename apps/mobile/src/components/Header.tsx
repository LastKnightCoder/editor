type HeaderProps = {
  title?: string;
  rightAction?: React.ReactNode;
};

export function Header({ title = "卡片", rightAction }: HeaderProps) {
  return (
    <header className="mobile-topbar topbar-immersive sticky top-0 z-30 flex items-center justify-between px-4">
      <div className="h-10 w-10" />

      <h1 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
        {title}
      </h1>

      <div className="flex h-10 w-10 items-center justify-center">
        {rightAction}
      </div>
    </header>
  );
}

export default Header;
