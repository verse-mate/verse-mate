import styles from "./item.module.css";

type ItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
};

export const Item = ({ icon, label, onClick }: ItemProps) => {
  return (
    <div className={styles.container}>
      <button type="button" className={`${styles.button}`} onClick={onClick}>
        <span className={`${styles.icon}`}>{icon}</span>
        <span className={styles.label}>{label}</span>
      </button>
    </div>
  );
};
