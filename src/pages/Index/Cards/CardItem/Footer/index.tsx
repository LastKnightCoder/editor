import styles from './index.module.less';
import {DeleteOutlined, EditOutlined} from "@ant-design/icons";
import {Tooltip} from "antd";

interface FooterProps {
  cardId: number;
}

const actions = [{
  icon: <EditOutlined />,
  tooltip: '编辑',
},{
  icon: <DeleteOutlined />,
  tooltip: '删除',
}];

const Footer = (props: FooterProps) => {
  const { cardId } = props;

  const handleClickDetail = () => {
    console.log(cardId);
  }

  return (
    <div className={styles.footer}>
      <div className={styles.actions}>
        {
          actions.map((action, index) => {
            return (
              <Tooltip key={index} title={action.tooltip}>
                <div className={styles.item}>
                  {action.icon}
                </div>
              </Tooltip>
            )
          })
        }
      </div>
      <div onClick={handleClickDetail} className={styles.detail}>查看详情{'>>'}</div>
    </div>
  )
}

export default Footer;