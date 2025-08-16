import { DefaultContent } from "../ui/Accordion/Content/default-content";
import { BookmarkList } from "../ui/Bookmarks";
import * as Icon from "../ui/Icons";

export const homeOptions = [
  {
    name: "bookmarks",
    icon: <Icon.BookmarkIcon />,
    label: "Bookmarks",
    content: <BookmarkList />,
  },
  {
    name: "favorites",
    icon: <Icon.HeartIcon />,
    label: "Favorites",
    content: <DefaultContent value="N/A" />,
  },
  {
    name: "notes",
    icon: <Icon.NotesIcon />,
    label: "Notes",
    content: <DefaultContent value="N/A" />,
  },
  {
    name: "highlights",
    icon: <Icon.PencilIcon />,
    label: "Highlights",
    content: <DefaultContent value="N/A" />,
  },
];
