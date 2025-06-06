import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "../../Icons";
import styles from "./portal.module.css";

type PortalProps = {
  bibleVersions: { key: string; value: string }[];
  version: string;
  onVersionSelected: (version: string) => void;
};

export const Portal = ({
  bibleVersions,
  version = "NASB1995",
  onVersionSelected,
}: PortalProps) => {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className={styles.content}
        sideOffset={16}
        align="start"
      >
        <DropdownMenu.RadioGroup
          value={version}
          onValueChange={(value) => onVersionSelected(value)}
        >
          {bibleVersions.map((bibleVersion) => (
            <DropdownMenu.RadioItem
              key={bibleVersion.key}
              className={styles.radioItem}
              value={bibleVersion.key}
            >
              {bibleVersion.value}
              <DropdownMenu.ItemIndicator className={styles.itemIndicator}>
                <CheckIcon />
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
};
