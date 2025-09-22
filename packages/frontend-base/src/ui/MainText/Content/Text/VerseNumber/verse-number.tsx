import { fetchAllTestaments } from "../../../../../hooks/useBible";
import { useNotes } from "../../../../../hooks/useNotes";
import { useGetSearchParams } from "../../../../../hooks/useSearchParams";
import { textActions } from "../../../../../utils/text-actions";
import { Popover } from "../../../../Popover";
import styles from "./verse-number.module.css";

type VerseNumberProps = {
  bookName: string;
  number: string;
};

export const VerseNumber = ({ number, bookName }: VerseNumberProps) => {
  const { addNote } = useNotes();
  const { bookId, verseId } = useGetSearchParams();
  const { testaments } = fetchAllTestaments();

  const handleActionClick = (actionName: string) => {
    if (actionName === "note") {
      const currentBook = testaments?.find((t) => t.b === bookId);
      if (currentBook && bookId && verseId) {
        const noteContent = prompt(
          `Add a note for ${bookName} ${verseId}:${number}`,
        );
        if (noteContent?.trim()) {
          addNote({
            bookName: currentBook.n,
            bookId,
            chapterNumber: verseId,
            verseNumber: Number.parseInt(number),
            content: noteContent.trim(),
          });
        }
      }
    }
    // Handle other actions (copy, share, bookmark, etc.) here in the future
  };

  return (
    <span className={styles.verseNumber}>
      <Popover.Root>
        <Popover.Trigger>{number}</Popover.Trigger>
        <Popover.Content
          align="start"
          sideOffset={10}
          style={{ zIndex: "9999" }}
        >
          <Popover.Header>
            {bookName} {number}
          </Popover.Header>
          <Popover.ListItem>
            {textActions.map((action) => {
              return (
                <Popover.Item
                  id={action.name}
                  key={action.name}
                  icon={action.icon}
                  label={action.label}
                  onClick={() => handleActionClick(action.name)}
                />
              );
            })}
          </Popover.ListItem>
        </Popover.Content>
      </Popover.Root>
    </span>
  );
};
