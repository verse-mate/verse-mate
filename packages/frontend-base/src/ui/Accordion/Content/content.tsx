import * as RadixAccordion from "@radix-ui/react-accordion";
import AccordionStyle from "./content.module.css";

type ContentProps = {
  children: React.ReactNode;
  styles?: React.CSSProperties;
};

export const Content = ({ children, styles }: ContentProps) => {
  return (
    <RadixAccordion.Content style={styles} className={AccordionStyle.content}>
      {children}
    </RadixAccordion.Content>
  );
};
