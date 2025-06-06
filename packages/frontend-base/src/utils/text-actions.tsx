import {
  BookmarkIcon,
  CopyIcon,
  HeartIcon,
  NotesIcon,
  PencilIcon,
  ShareIcon,
} from "../ui/Icons";

export const textActions = [
  {
    name: "bookmark",
    label: "Bookmark Verse",
    icon: <BookmarkIcon />,
  },
  {
    name: "favorite",
    label: "Add to Favorites",
    icon: <HeartIcon />,
  },
  {
    name: "note",
    label: "Take a Note",
    icon: <NotesIcon />,
  },
  {
    name: "highlightVerse",
    label: "Hightlight Verse",
    icon: <PencilIcon />,
  },
  {
    name: "copyVerse",
    label: "Copy Verse",
    icon: <CopyIcon />,
  },
  {
    name: "shareVerse",
    label: "Share Verse",
    icon: <ShareIcon />,
  },
];
