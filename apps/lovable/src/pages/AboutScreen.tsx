import { useNavigate } from 'react-router-dom';
import ScreenHeader from '@/components/ScreenHeader';

export default function AboutScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader title="About" onBack={() => navigate('/menu')} />

      <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-8" style={{ backgroundColor: '#000000' }}>
        {/* Compact image — constrained height, centered */}
        <div className="rounded-xl overflow-hidden mt-4 mx-auto" style={{ backgroundColor: '#323232', maxHeight: 180, maxWidth: 320 }}>
          <img
            src="https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=600&auto=format&fit=crop"
            alt="Bible on desk"
            className="w-full h-full object-cover"
            style={{ maxHeight: 180 }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        <h1 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 20, lineHeight: '28px', color: '#E7E7E7', marginTop: 20 }}>
          Built by Believers.<br />
          Guided by the Word.
        </h1>

        <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '22px', color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>
          VerseMate is a nonprofit organization on a mission to make the Bible easier to
          understand, study, and love — for everyone, everywhere. We are developers,
          translators, and believers from around the world, united by one calling: to help
          more people connect with God through His Word.
        </p>
        <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '22px', color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
          To make the Word of God easy to understand, deeply accessible, and free to everyone
          — so more people around the world can encounter Scripture, grow in faith, and walk
          closer with Christ.
        </p>

        {/* Section 2 */}
        <h2 style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 18, lineHeight: '26px', color: '#E7E7E7', marginTop: 24 }}>
          Illuminating God's Word for Everyone
        </h2>
        <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 14, lineHeight: '22px', color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
          We believe the Bible isn't just for scholars or clergy — it's for everyone. Whether
          you're discovering Scripture for the first time or leading a study group, VerseMate
          helps illuminate God's Word for real understanding and lasting transformation.
        </p>

        {/* Team + Version */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #2a2a2a' }}>
          <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}>
            SB · AC · AM · AZ · SZ · VB · VK · VK · AT
          </p>
          <p style={{ fontFamily: 'Roboto, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
            VerseMate · Version 1.0
          </p>
        </div>
      </div>
    </div>
  );
}
