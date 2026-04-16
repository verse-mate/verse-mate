import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Lock, ShieldCheck } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';

type Cadence = 'monthly' | 'once';

const PRESETS = [10, 25, 50, 100] as const;
// Unsplash: open Bible in warm candlelight, dark moody backdrop
const HERO_URL =
  'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=900&q=80&auto=format&fit=crop';

export default function GivingScreen() {
  const navigate = useNavigate();
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [amount, setAmount] = useState<number>(25);

  const mailtoHref = `mailto:info@versemate.org?subject=${encodeURIComponent(
    `${cadence === 'monthly' ? 'Monthly' : 'One-time'} donation — $${amount}`,
  )}&body=${encodeURIComponent(
    `I'd like to give $${amount} ${cadence === 'monthly' ? 'monthly' : 'as a one-time gift'} to support VerseMate.`,
  )}`;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#000' }}>
      <ScreenHeader title="Giving" onBack={() => navigate('/menu')} />

      <div className="flex-1 overflow-y-auto min-h-0" style={{ backgroundColor: '#000' }}>
        {/* Hero — cinematic candlelit Bible */}
        <div style={{ position: 'relative', height: 240, overflow: 'hidden', backgroundColor: '#1a1005' }}>
          <img
            src={HERO_URL}
            alt="Open Bible in warm candlelight"
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Gradient fade into page body */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 120,
              background: 'linear-gradient(180deg, transparent 0%, #000 90%)',
            }}
          />
        </div>

        <div style={{ padding: '24px 22px 32px' }}>
          {/* Kicker */}
          <p
            style={{
              fontFamily: 'Roboto, sans-serif',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '2px',
              color: '#B09A6D',
              textTransform: 'uppercase',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Support VerseMate
          </p>
          <div
            style={{
              height: 1,
              width: 40,
              backgroundColor: '#B09A6D',
              opacity: 0.5,
              margin: '12px auto 20px',
            }}
          />

          {/* Headline */}
          <h1
            style={{
              fontFamily: "'Roboto Serif', Georgia, serif",
              fontSize: 28,
              fontWeight: 400,
              lineHeight: '1.25',
              color: '#E7E7E7',
              textAlign: 'center',
              margin: 0,
              marginBottom: 14,
            }}
          >
            Give the Word to the world.
          </h1>

          {/* Lead */}
          <p
            style={{
              fontFamily: 'Roboto, sans-serif',
              fontSize: 14,
              lineHeight: '22px',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
              margin: 0,
              marginBottom: 28,
            }}
          >
            Every gift keeps Scripture free, clear, and accessible for everyone, everywhere.
          </p>

          {/* Monthly / One-time toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['monthly', 'once'] as const).map((c) => {
              const active = cadence === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCadence(c)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    fontFamily: 'Roboto, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    border: `1px solid ${active ? 'rgba(176,154,109,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    backgroundColor: active ? '#1a1a1a' : 'transparent',
                    color: active ? '#B09A6D' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                  }}
                >
                  {c === 'monthly' ? 'Monthly' : 'One-time'}
                </button>
              );
            })}
          </div>

          {/* Preset amount chips */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
              marginBottom: 10,
            }}
          >
            {PRESETS.map((v) => {
              const selected = v === amount;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  style={{
                    height: 56,
                    borderRadius: 12,
                    fontFamily: 'Roboto, sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                    border: `1px solid ${selected ? '#B09A6D' : 'rgba(176,154,109,0.4)'}`,
                    backgroundColor: selected ? '#B09A6D' : 'rgba(176,154,109,0.08)',
                    color: selected ? '#000' : '#B09A6D',
                    boxShadow: selected ? '0 0 24px rgba(176,154,109,0.3)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ${v}
                </button>
              );
            })}
          </div>

          {/* Other amount */}
          <button
            type="button"
            onClick={() => {
              const input = window.prompt('Enter custom amount ($)', String(amount));
              if (input) {
                const n = Number.parseInt(input.replace(/\D/g, ''), 10);
                if (!Number.isNaN(n) && n > 0) setAmount(n);
              }
            }}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.6)',
              fontFamily: 'Roboto, sans-serif',
              fontSize: 13,
              cursor: 'pointer',
              marginBottom: 20,
            }}
          >
            + Other amount
          </button>

          {/* CTA */}
          <a
            href={mailtoHref}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              height: 56,
              borderRadius: 12,
              backgroundColor: '#B09A6D',
              color: '#000',
              fontFamily: 'Roboto, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <Heart size={16} strokeWidth={2.25} />
            Give ${amount}
            {cadence === 'monthly' ? ' Monthly' : ''}
          </a>

          {/* Trust badges */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              marginTop: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontFamily: 'Roboto, sans-serif',
              }}
            >
              <ShieldCheck size={14} strokeWidth={1.5} />
              501(c)(3)
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontFamily: 'Roboto, sans-serif',
              }}
            >
              <Lock size={14} strokeWidth={1.5} />
              Secure
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
