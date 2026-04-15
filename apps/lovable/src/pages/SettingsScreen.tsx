import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { BibleVersion } from '@/services/types';
import ScreenHeader from '@/components/ScreenHeader';
import { api } from '@/services/api';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { settings } = state;

  const updateSetting = (partial: Partial<typeof settings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: partial });
  };

  const setLanguage = async (code: 'en' | 'es' | 'fr' | 'pt') => {
    updateSetting({ language: code });
    try {
      await api.patch('/user/preferences', { preferred_language: code });
    } catch {
      /* ignore when signed out */
    }
  };

  const sectionLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 16,
    fontWeight: 600,
    fontSize: 20,
    color: '#E7E7E7',
    fontFamily: 'Roboto, sans-serif',
  };

  const containerBoxStyle: React.CSSProperties = {
    backgroundColor: '#323232',
    border: '1px solid #323232',
    borderRadius: 8,
    padding: 20,
    maxWidth: 500,
    boxSizing: 'border-box',
  };

  const dropdownLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontWeight: 500,
    color: '#E7E7E7',
    fontSize: 14,
    lineHeight: '1.4',
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader title="Settings" onBack={() => navigate('/menu')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: 'Roboto, sans-serif', backgroundColor: '#000000' }}>

        {/* Bible Version section */}
        <section style={{ marginBottom: 40 }}>
          <span style={sectionLabelStyle}>Bible Version</span>
          <div style={containerBoxStyle}>
            <span style={dropdownLabelStyle}>Default version</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {(['ESV', 'NIV', 'KJV', 'NLT'] as BibleVersion[]).map(v => (
                <button
                  key={v}
                  onClick={() => updateSetting({ defaultVersion: v })}
                  style={{
                    height: 44,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: settings.defaultVersion === v ? 'none' : '1px solid #323232',
                    backgroundColor: settings.defaultVersion === v ? '#B09A6D' : '#1B1B1B',
                    color: settings.defaultVersion === v ? '#000000' : '#E7E7E7',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Language section */}
        <section style={{ marginBottom: 40 }}>
          <span style={sectionLabelStyle}>Language</span>
          <div style={containerBoxStyle}>
            <span style={dropdownLabelStyle}>Display language</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'es', label: 'Español' },
                  { id: 'fr', label: 'Français' },
                  { id: 'pt', label: 'Português' },
                ] as const
              ).map(l => (
                <button
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                  style={{
                    height: 44,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: settings.language === l.id ? 'none' : '1px solid #323232',
                    backgroundColor: settings.language === l.id ? '#B09A6D' : '#1B1B1B',
                    color: settings.language === l.id ? '#000000' : '#E7E7E7',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Font size section */}
        <section style={{ marginBottom: 40 }}>
          <span style={sectionLabelStyle}>Display</span>
          <div style={containerBoxStyle}>
            <span style={dropdownLabelStyle}>Font size</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: '#E7E7E7' }}>Size</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{settings.fontSize}px</span>
            </div>
            <input
              type="range"
              min={13}
              max={26}
              value={settings.fontSize}
              onChange={e => updateSetting({ fontSize: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#b09a6d' }}
            />
          </div>
        </section>

        <section style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>VerseMate · Version 1.0.0</p>
        </section>
      </div>
    </div>
  );
}
