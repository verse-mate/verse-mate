import { useApp } from '@/contexts/AppContext';
import { Note } from '@/services/types';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import ShareIcon from '@/components/ShareIcon';

interface Props {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
}

/**
 * NoteOptionsSheet — dark bottom sheet. Figma: 5310:16518.
 * Title "Notes Options", 4 square tiles (Copy / Share / Edit / Delete red),
 * bordered Cancel row below. Title centered, no icons except the tiles.
 */
export default function NoteOptionsSheet({ note, onClose, onEdit }: Props) {
  const { removeNote } = useApp();

  const handleDelete = async () => {
    await removeNote(note.id);
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard
      ?.writeText(`${note.book} ${note.chapter}:${note.verse}\n${note.text}`)
      .catch(() => undefined);
    onClose();
  };

  const handleShare = async () => {
    try {
      await navigator.share?.({
        text: `${note.book} ${note.chapter}:${note.verse}\n${note.text}`,
      });
    } catch {
      handleCopy();
      return;
    }
    onClose();
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/60" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 z-50 bg-dark-surface rounded-t-[24px] border-t border-dark safe-bottom animate-slide-up"
        role="dialog"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-dark-muted/40" />
        </div>

        {/* Title */}
        <h3 className="text-center text-[18px] text-dark-fg mt-4 mb-5">
          Notes Options
        </h3>

        {/* 4 action tiles */}
        <div className="grid grid-cols-4 gap-2 px-5">
          <SheetTile icon={<Copy size={20} strokeWidth={1.5} />} label="Copy" onClick={handleCopy} />
          <SheetTile icon={<ShareIcon size={20} color="currentColor" />} label="Share" onClick={handleShare} />
          <SheetTile
            icon={<Pencil size={20} strokeWidth={1.5} />}
            label="Edit"
            onClick={() => {
              onClose();
              onEdit();
            }}
          />
          <SheetTile
            icon={<Trash2 size={20} strokeWidth={1.5} />}
            label="Delete"
            onClick={handleDelete}
            destructive
          />
        </div>

        {/* Bordered Cancel */}
        <div className="px-5 pt-5 pb-6">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-dark-surface border border-dark text-dark-fg text-[14px] font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function SheetTile({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[88px] rounded-2xl border flex flex-col items-center justify-center gap-1.5 ${
        destructive
          ? 'bg-[#2a1617] border-[#4d1f22] text-red-400'
          : 'bg-dark-raised border-dark text-dark-fg'
      }`}
    >
      {icon}
      <span className="text-[13px] font-normal">{label}</span>
    </button>
  );
}
