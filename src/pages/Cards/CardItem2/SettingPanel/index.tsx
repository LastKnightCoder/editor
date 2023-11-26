import For from '@/components/For';

import styles from './index.module.less';

export interface ISettingItem {
  title: string;
  onClick?: (cardId: number) => void;
}

interface ISettingPanelProps {
  cardId: number;
  settings: ISettingItem[];
  closePanel?: () => void;
}

const SettingPanel = (props: ISettingPanelProps) => {
  const { settings, cardId, closePanel } = props;

  if (settings.length === 0) return null;

  return (
    <div className={styles.settings}>
      <For
        data={settings}
        renderItem={(setting) => (
          <div key={setting.title} className={styles.settingItem} onClick={(e) => {
            setting?.onClick?.(cardId);
            closePanel?.();
            e.stopPropagation();
          }}>
            {setting.title}
          </div>
        )}
      />
    </div>
  )
}

export default SettingPanel;