import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined } from "@ant-design/icons";

interface ICardProps {
  createCard?: () => Promise<void>;
}

const Card = (props: ICardProps) => {
  const { createCard } = props;

  return (
    <div>
      <TitlebarIcon onClick={createCard}>
        <PlusOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default Card;