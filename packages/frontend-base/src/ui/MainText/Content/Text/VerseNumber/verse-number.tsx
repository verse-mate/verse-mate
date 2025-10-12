import styles from "./verse-number.module.css";

type VerseNumberProps = {
  number: string;
};

export const VerseNumber = ({ number }: VerseNumberProps) => {
  return (
    <span className={styles.verseNumber}>
      {/* <Popover.Root>
        <Popover.Trigger> */}
      {number}
      {/* </Popover.Trigger>
        <Popover.Portal>
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
                  />
                );
              })}
            </Popover.ListItem>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root> */}
    </span>
  );
};
