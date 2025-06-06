import styles from "./filter-input.module.css";

interface FilterInputProps {
  placeholder: string;
  filterable?: boolean;
  position?: "top" | "under";
  debouncedFilter: string;
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const FilterInput: React.FC<FilterInputProps> = ({
  filterable,
  position,
  debouncedFilter,
  handleChange,
  placeholder,
}) => {
  if (!filterable) return null;
  return (
    <div
      className={styles.filterContainer}
      style={
        position === "top"
          ? { position: "absolute", top: 0 }
          : { position: "absolute", top: "64px" }
      }
    >
      <input
        className={styles.filterInput}
        type="text"
        placeholder={placeholder}
        value={debouncedFilter}
        onChange={handleChange}
      />
    </div>
  );
};
