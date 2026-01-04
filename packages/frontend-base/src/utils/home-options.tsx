import { BookmarkList } from "../ui/Bookmarks";
import { HighlightsList } from "../ui/Highlights";
import * as Icon from "../ui/Icons";
import { NotesList } from "../ui/Notes/NotesList";

export const homeOptions = [
  {
    name: "bookmarks",
    icon: <Icon.BookmarkIcon />,
    label: "Bookmarks",
    content: <BookmarkList />,
  },
  {
    name: "notes",
    icon: <Icon.NotesIcon />,
    label: "Notes",
    content: <NotesList />,
  },
  {
    name: "highlights",
    icon: <Icon.PencilIcon />,
    label: "Highlights",
    content: <HighlightsList />,
  },
];
