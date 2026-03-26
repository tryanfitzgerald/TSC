import React, { useState, useEffect } from 'react';
import { SECTION_30C_DEADLINE } from '../data/assumptions';

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}

function getTimeLeft(target) {
  const now = new Date();
  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, totalDays: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
    totalDays: Math.floor(diff / (1000 * 60 * 60 * 24)),
  };
}

export default function NavBar({ view, setView }) {
  const countdown = useCountdown(SECTION_30C_DEADLINE);

  // Color shifts: green > 60 days, amber 30-60, red < 30
  const timerColor = countdown.expired ? 'text-accent-red'
    : countdown.totalDays < 30 ? 'text-accent-red'
    : countdown.totalDays < 60 ? 'text-accent-amber'
    : 'text-accent-green';

  const timerBg = countdown.expired ? 'bg-red-900/30 border-red-700'
    : countdown.totalDays < 30 ? 'bg-red-900/30 border-red-700'
    : countdown.totalDays < 60 ? 'bg-amber-900/30 border-amber-700'
    : 'bg-emerald-900/30 border-emerald-700';

  return (
    <nav className="bg-navy-800 border-b border-navy-700 px-4 py-2 flex items-center justify-between flex-shrink-0 z-50">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">Shorewood Charging</h1>
            <p className="text-[10px] text-muted leading-tight">Intelligence Platform</p>
          </div>
        </div>

        <div className="flex gap-1">
          {[
            { key: 'map', icon: '🗺️', label: 'Competitive Map' },
            { key: 'financial', icon: '📊', label: 'Financial Projections' },
            { key: 'utility', icon: '⚡', label: 'Utility Incentives' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                view === tab.key
                  ? 'bg-accent-teal/20 text-accent-teal border border-accent-teal/40'
                  : 'text-muted hover:text-white hover:bg-navy-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right: §30C Countdown */}
      <div className={`flex items-center gap-2 px-3 py-1 rounded border text-xs ${timerBg}`}>
        <span className="text-muted font-medium">§30C Deadline:</span>
        {countdown.expired ? (
          <span className="text-accent-red font-bold">EXPIRED</span>
        ) : (
          <span className={`font-mono font-bold ${timerColor}`}>
            {countdown.days}d · {String(countdown.hours).padStart(2,'0')}h · {String(countdown.minutes).padStart(2,'0')}m · {String(countdown.seconds).padStart(2,'0')}s
          </span>
        )}
      </div>
    </nav>
  );
}
