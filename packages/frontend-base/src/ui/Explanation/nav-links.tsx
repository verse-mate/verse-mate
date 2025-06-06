import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { useExplanation } from "../../hooks/useExplanation";
import { explanationTypes } from "../../utils/commentary-options";
import styles from "./explanation.module.css";

export const NavLinks = () => {
  const { explanationType, handleValueChange } = useExplanation();

  return (
    <>
      {explanationTypes.map((type) => (
        <button
          className={`${styles.button} ${type.value === explanationType ? styles.selectedButton : ""}`}
          value={`${type.value}`}
          type="button"
          key={type.value}
          onClick={() => handleValueChange(type.value as ExplanationTypeEnum)}
        >
          {type.label}
        </button>
      ))}
    </>
  );
};
