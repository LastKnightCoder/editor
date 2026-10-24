// 正文字体选择：系统默认 + 按需下载的阅读字体。已下载的点选即时生效并落盘；
// 未下载的点行或「下载」开始下载，完成后自动选中。作为 BottomSheet 内容使用。

import { useEffect } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useAppContext } from "../../../app/AppContext";
import { CheckBubble } from "../../../components/CheckBubble";
import { toast } from "../../../components/toast";
import {
  fontTotalSize,
  readingFontErrorMessage,
  removeReadingFont,
  type ReadingFontRelease,
} from "../readingFont/api";
import { useReadingFontDownload } from "../readingFont/downloadStore";
import {
  READING_FONT_OPTIONS,
  READING_FONT_SAMPLE,
  formatFontSize,
  normalizeReadingFontId,
  readingFontFamily,
  withReadingFont,
  type ReadingFontId,
  type ReadingFontOption,
} from "../readingFont/fonts";
import {
  useInstalledReadingFonts,
  useInvalidateInstalledReadingFonts,
  useReadingFontCatalog,
} from "../readingFont/queries";
import { forgetReadingFontFaces, loadReadingFontFaces } from "../readingFont/runtime";
import { GroupRow } from "./ui";

const NO_FONTS: ReadingFontRelease[] = [];

function TrailingButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        props.onClick();
      }}
      className="text-accent bg-accent-soft shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-opacity active:opacity-60 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function FontRow(props: {
  option: ReadingFontOption;
  active: boolean;
  installed: ReadingFontRelease | undefined;
  latest: ReadingFontRelease | undefined;
  onSelect: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const { option, active, installed, latest } = props;
  const downloadingId = useReadingFontDownload(state => state.downloadingId);
  const progress = useReadingFontDownload(state => state.progress);
  const error = useReadingFontDownload(state => state.error);
  const cancel = useReadingFontDownload(state => state.cancel);
  const isSystem = option.id === "system";
  const ready = isSystem || Boolean(installed);
  const downloading = downloadingId === option.id;
  const sizeLabel = latest ? ` ${formatFontSize(fontTotalSize(latest))}` : "";
  const hasUpdate = Boolean(installed && latest && installed.version !== latest.version);
  // 已安装的字体直接用自身渲染名称与样张；未下载时只能用系统字体，靠说明文字区分风格
  const fontFamily =
    ready && !isSystem ? `"${readingFontFamily(option.id)}", var(--tau-font)` : undefined;

  let trailing: ReactNode = null;
  if (downloading) {
    const percent =
      progress && progress.total > 0 ? Math.floor((progress.received / progress.total) * 100) : 0;
    trailing = <TrailingButton onClick={() => void cancel()}>{percent}% · 取消</TrailingButton>;
  } else if (!ready) {
    trailing = (
      <TrailingButton disabled={Boolean(downloadingId)} onClick={props.onDownload}>
        下载{sizeLabel}
      </TrailingButton>
    );
  } else if (active) {
    trailing = <CheckBubble />;
  } else if (hasUpdate) {
    trailing = (
      <TrailingButton disabled={Boolean(downloadingId)} onClick={props.onDownload}>
        更新{sizeLabel}
      </TrailingButton>
    );
  } else if (!isSystem) {
    trailing = <TrailingButton onClick={props.onRemove}>移除</TrailingButton>;
  }

  return (
    <GroupRow onClick={downloading ? undefined : ready ? props.onSelect : props.onDownload}>
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block text-[15px] font-semibold" style={{ fontFamily }}>
          {option.label}
        </span>
        <span className="text-ink-2 mt-1 block text-[13px] leading-relaxed" style={{ fontFamily }}>
          {ready ? READING_FONT_SAMPLE : option.description}
        </span>
        {error?.id === option.id ? (
          <span className="text-danger mt-1 block text-[12px] font-medium">{error.message}</span>
        ) : null}
      </span>
      {trailing}
    </GroupRow>
  );
}

export function ReadingFontSection() {
  const app = useAppContext();
  const active = normalizeReadingFontId(app.syncSettings.safeSetting?.appearance?.readingFont);
  const installed = useInstalledReadingFonts().data ?? NO_FONTS;
  const catalog = useReadingFontCatalog().data ?? NO_FONTS;
  const invalidateInstalled = useInvalidateInstalledReadingFonts();
  const download = useReadingFontDownload(state => state.download);

  // 打开面板时注册已下载字体，样张才能用字体本身渲染
  useEffect(() => {
    for (const font of installed) {
      loadReadingFontFaces(font).catch(() => undefined);
    }
  }, [installed]);

  const select = (id: ReadingFontId) => {
    app.syncSettings.updateSetting(prev => withReadingFont(prev, id), { persist: true });
  };

  const startDownload = (id: ReadingFontId) => {
    void download(id, () => {
      void invalidateInstalled();
      select(id);
    });
  };

  const remove = async (id: ReadingFontId) => {
    try {
      await removeReadingFont(id);
      forgetReadingFontFaces(id);
      await invalidateInstalled();
    } catch (error) {
      toast.error(readingFontErrorMessage(error));
    }
  };

  return (
    <div className="space-y-3">
      <div className="setting-group">
        {READING_FONT_OPTIONS.map(option => (
          <FontRow
            key={option.id}
            option={option}
            active={active === option.id}
            installed={installed.find(font => font.id === option.id)}
            latest={catalog.find(font => font.id === option.id)}
            onSelect={() => select(option.id)}
            onDownload={() => startDownload(option.id)}
            onRemove={() => void remove(option.id)}
          />
        ))}
      </div>
      <p className="text-ink-3 px-1 text-[12px] leading-relaxed">
        正文字体只影响文档正文与标题，界面文字不变。字体按需下载，存放在本机。
      </p>
    </div>
  );
}
