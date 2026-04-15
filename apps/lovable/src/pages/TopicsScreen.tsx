import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTopics } from '@/services/bibleService';
import { Topic } from '@/services/types';
import { ChevronRight, Search } from 'lucide-react';
import ScreenHeader from '@/components/ScreenHeader';

export default function TopicsScreen() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchTopics().then(setTopics);
  }, []);

  const filtered = useMemo(
    () => topics.filter(t => t.name.toLowerCase().includes(query.toLowerCase())),
    [topics, query]
  );

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1B1B1B' }}>
      <ScreenHeader title="Topics" onBack={() => navigate('/read')} />

      {/* Search */}
      <div className="px-4 pt-1" style={{ backgroundColor: '#000000' }}>
        <div className="flex items-center gap-2 h-12 px-4 rounded-full" style={{ backgroundColor: '#323232', border: '1px solid #323232' }}>
          <Search size={18} style={{ color: 'rgba(255,255,255,0.6)' }} strokeWidth={2} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[15px] focus:outline-none"
            style={{ color: '#E7E7E7' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6" style={{ backgroundColor: '#000000' }}>
        {filtered.map(topic => (
          <button
            key={topic.id}
            onClick={() => navigate(`/topics/${topic.id}`)}
            className="flex items-center justify-between w-full h-[56px] text-left"
            style={{ borderBottom: '1px solid #323232' }}
          >
            <span className="text-[16px]" style={{ color: '#E7E7E7' }}>{topic.name}</span>
            <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-[14px] text-center py-8" style={{ color: 'rgba(255,255,255,0.6)' }}>No topics found</p>
        )}
      </div>
    </div>
  );
}
