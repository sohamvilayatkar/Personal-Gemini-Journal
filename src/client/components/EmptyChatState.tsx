import React from 'react';
import { Sparkles, MessageCircle, Heart, Compass, Sunrise } from 'lucide-react';

interface EmptyChatStateProps {
  onSelectStarter: (text: string) => void;
}

export const EmptyChatState: React.FC<EmptyChatStateProps> = ({ onSelectStarter }) => {
  const starters = [
    {
      icon: Compass,
      title: 'Navigate a challenging moment',
      text: 'I had a difficult situation today and would like to unpack how I handled it.',
    },
    {
      icon: Heart,
      title: 'Honor a quiet accomplishment',
      text: 'I want to celebrate a small win from today that went unacknowledged.',
    },
    {
      icon: Sunrise,
      title: 'Cultivate evening calm',
      text: "I'm feeling mentally scattered right now. Help me untangle my current thoughts.",
    },
    {
      icon: MessageCircle,
      title: 'Deep personal inquiry',
      text: 'What is one perspective I might be overlooking about my current routine?',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-8">
      <div className="space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 text-stone-900 mx-auto flex items-center justify-center shadow-xs">
          <Sparkles className="w-6 h-6 text-stone-800" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 tracking-tight">Your Reflection Space</h2>
        <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          Begin a secure, multi-turn inquiry with your AI companion. Your reflections are strictly isolated to your verified account.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-left">
        {starters.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectStarter(item.text)}
              className="p-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50/80 hover:border-stone-300 transition-all text-left shadow-2xs group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1.5 text-stone-700">
                <Icon className="w-3.5 h-3.5 text-stone-500 group-hover:text-stone-900 transition-colors" />
                <span className="text-xs font-semibold text-stone-900">{item.title}</span>
              </div>
              <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{item.text}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
