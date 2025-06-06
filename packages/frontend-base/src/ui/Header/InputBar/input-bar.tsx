import { useInput } from "../../../hooks/useInput";
import { ArrowUpIcon, XIcon } from "../../Icons";
import styles from "./input-bar.module.css";

type InputBarProps = {
  setIsFocused: (isFocused: boolean) => void;
};

export const InputBar = ({ setIsFocused }: InputBarProps) => {
  const {
    isHovered,
    isFocused,
    inputValue,
    isLastMessageSameAsInput,
    handleChange,
    handleSubmit,
    handleClearInput,
    handleMouseEnter,
    handleMouseLeave,
  } = useInput();

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`${styles.searchContainer} ${isFocused ? styles.focused : ""}`}
    >
      <input
        type="text"
        placeholder="Ask VerseMate"
        className={styles.searchInput}
        onChange={handleChange}
        value={inputValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {isLastMessageSameAsInput && inputValue !== "" ? (
        <button
          type="button"
          onClick={handleClearInput}
          className={`${styles.sendButton} ${styles.clearButton}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <XIcon className={styles.icon} isHovered={isHovered} />
        </button>
      ) : (
        <button
          type="submit"
          className={`${styles.sendButton} ${
            inputValue !== "" ? styles.active : ""
          }`}
          disabled={!inputValue}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <ArrowUpIcon className={styles.icon} isHovered={isHovered} />
        </button>
      )}
    </form>
  );
};
