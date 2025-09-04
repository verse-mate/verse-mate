import { useBibleVersion } from "@verse-mate/frontend-base/src/hooks/useBibleVersion";
import { Settings } from "@verse-mate/frontend-base/src/ui/Settings/Settings";

const SettingsPage = () => {
  const { bibleVersion, setBibleVersion } = useBibleVersion();

  return (
    <Settings
      selectedBibleVersion={bibleVersion}
      setSelectedBibleVersion={setBibleVersion}
      setRightPanelContent={() => {}}
    />
  );
};

export default SettingsPage;
