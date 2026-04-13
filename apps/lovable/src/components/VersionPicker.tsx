import { useApp } from '@/contexts/AppContext';
import { BibleVersion } from '@/services/types';
import { X, Check } from 'lucide-react';

const VERSIONS: { id: BibleVersion; name: string; desc: string }[] = [
  { id: 'ESV', name: 'ESV', desc: 'English Standard Version' },
  { id: 'NIV', name: 'NIV', desc: 'New International Version' },
  { id: 'KJV', name: 'KJV', desc: 'King James Version' },
  { id: 'NLT', name: 'NLT', desc: 'New Living Translation' },
];

interface Props {
  onClose: () => void;
}

export default function VersionPicker({ onClose }: Props) {
  const { state, dispatch } = useApp();

  return (
    <>
      <div className="absolute inset-0 z-40 bg-foreground/20" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-lg border-t border-border animate-slide-up">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="font-semibold text-foreground text-[15px]">Select Version</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
            <X size={18} />
          </button>
        </div>
        <div className="py-1">
          {VERSIONS.map(v => (
            <button
              key={v.id}
              onClick={() => {
                dispatch({ type: 'SET_VERSION', version: v.id });
                onClose();
              }}
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary transition-colors"
            >
              <div className="text-left">
                <p className="font-medium text-foreground text-[14px]">{v.name}</p>
                <p className="text-[12px] text-muted-foreground">{v.desc}</p>
              </div>
              {state.version === v.id && <Check size={18} className="text-accent" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
