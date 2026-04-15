import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useRightPanel } from '@/contexts/RightPanelContext';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  /** Optional right-side action node */
  rightAction?: ReactNode;
}

/**
 * ScreenHeader — sub-page header with BLACK bg (#000) and white text.
 * Production: background-color var(--night) = #000.
 */
export default function ScreenHeader({ title, onBack, rightAction }: ScreenHeaderProps) {
  const navigate = useNavigate();
  const rightPanel = useRightPanel();
  // When inside the desktop right panel, always use the panel's goBack
  const handleBack = rightPanel?.isRightPanel ? rightPanel.goBack : (onBack || (() => navigate('/read')));

  const isInRightPanel = !!rightPanel?.isRightPanel;

  return (
    <header
      className="shrink-0 safe-top"
      style={{
        backgroundColor: '#1A1A1A',
        paddingTop: isInRightPanel ? 0 : 'max(env(safe-area-inset-top), 48px)',
        borderBottom: '1px solid #323232',
      }}
    >
      <div className="relative flex items-center justify-center px-3" style={{ height: isInRightPanel ? 48 : 56 }}>
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            background: 'none',
            border: 'none',
            padding: '8px',
            marginRight: '12px',
            borderRadius: '4px',
            cursor: 'pointer',
            position: 'absolute',
            left: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
          }}
        >
          <ArrowLeft size={24} color="#fff" strokeWidth={2} />
        </button>
        <h1 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500, fontSize: 18, lineHeight: '24px', color: '#FFFFFF', letterSpacing: '-0.01em' }}>{title}</h1>
        {rightAction && (
          <div className="absolute right-2 flex items-center">{rightAction}</div>
        )}
      </div>
    </header>
  );
}
