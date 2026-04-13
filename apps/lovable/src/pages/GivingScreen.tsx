import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';

export default function GivingScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader title="Giving" onBack={() => navigate('/menu')} />

      <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-8" style={{ backgroundColor: '#000000' }}>
        {/* Icon + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20, marginBottom: 4 }}>
          <Heart size={16} color="#B09A6D" strokeWidth={1.5} />
          <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B09A6D', margin: 0 }}>
            Support VerseMate
          </p>
        </div>
        <div style={{ height: 2, width: 48, backgroundColor: '#B09A6D', opacity: 0.5, marginBottom: 16 }} />

        <h1 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 20, lineHeight: '28px', color: '#E7E7E7', margin: 0 }}>
          Help People Everywhere Engage with God's Word
        </h1>

        <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '22px', color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>
          Your generosity helps us create resources and tools that make Scripture clear and
          accessible to people worldwide. Every gift you give makes a direct impact — whether
          it's supporting the translation of content, improving our technology, or helping us
          reach new communities with the truth of God's Word.
        </p>
        <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '22px', color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
          Through your partnership, VerseMate can continue developing simple, powerful tools
          that guide people not only to read the Bible, but to truly understand and apply it in
          their daily lives.
        </p>

        {/* CTA button — mailto matches production (info@versemate.org) */}
        <a
          href="mailto:info@versemate.org?subject=Donation%20Inquiry&body=I%20would%20like%20to%20support%20VerseMate."
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            height: 48,
            marginTop: 24,
            borderRadius: 12,
            backgroundColor: '#B09A6D',
            color: '#000',
            fontFamily: 'Roboto, sans-serif',
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <Heart size={16} strokeWidth={2} />
          Support VerseMate
        </a>
      </div>
    </div>
  );
}
