import { useState } from "react";
import { bibleVersions } from "../../utils/bible-versions";
import { CheckIcon, ChevronBackward, ChevronDownIcon } from "../Icons";
import { SelectDropdown } from "../SelectDropdown";
import styles from "./settings.module.css";

interface SettingsProps {
  selectedBibleVersion: string;
  setSelectedBibleVersion: (version: string) => void;
  setRightPanelContent: (value: string) => void;
}

export const Settings = ({
  selectedBibleVersion,
  setSelectedBibleVersion,
  setRightPanelContent,
}: SettingsProps) => {
  const selectedVersionData = bibleVersions.find(
    (version) => version.key === selectedBibleVersion,
  );
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.settingsRoot}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setRightPanelContent("default")}
        >
          <ChevronBackward className={styles.backIcon} />
        </button>
        <h3>Settings</h3>
      </div>
      <div style={{ height: "30px" }} />
      <div>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            fontWeight: "bold",
            fontSize: "20px",
          }}
        >
          Bible Version:
        </label>
        <SelectDropdown.Root
          onValueChange={(val) => setSelectedBibleVersion(val)}
          open={isOpen}
          onOpenChange={setIsOpen}
          className={styles.bibleVersionDropdown}
        >
          <SelectDropdown.Trigger
            selectedBook={null}
            selectedVerse={null}
            defaultPlaceholder={selectedVersionData?.value || "Select Version"}
            icon={<ChevronDownIcon />}
            onClick={() => setIsOpen((prev) => !prev)}
          />
          <SelectDropdown.Content
            align="start"
            style={{
              width: "300px",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {bibleVersions.map((version) => (
              <SelectDropdown.Item
                key={version.key}
                value={version.key}
                icon={<CheckIcon />}
              >
                {version.value}
              </SelectDropdown.Item>
            ))}
          </SelectDropdown.Content>
        </SelectDropdown.Root>
      </div>
    </div>
  );
};
