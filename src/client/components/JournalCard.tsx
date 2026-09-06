import React from 'react';
import type { JournalEntry } from '../../shared/types';
import { Sparkles, User, Tag, Calendar, ChevronRight } from 'lucide-react';

interface JournalCardProps {
  journal: JournalEntry;
  onSelect: (journal: JournalEntry) => void;
}

export const JournalCard: React.FC<JournalCardProps> = ({ journal, onSelect }) => {
  const formattedDate = new Date(journal.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      id={`journal-card-${journal.id}`}
      onClick={() => onSelect(journal)}
      className="bg-white rounded-xl border border-stone-200/90 p-5 hover:border-stone-300 hover:shadow-xs transition-all duration-150 cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Card Header: Mood & Provenance */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
              {journal.mood}
            </span>

            {journal.updatedBy === 'user' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-200/60">
                <User className="w-2.5 h-2.5" />
                Edited
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-purple-50 text-purple-700 border border-purple-200/60">
                <Sparkles className="w-2.5 h-2.5" />
                AI Generated
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono text-stone-400">
            <Calendar className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-stone-900 group-hover:text-stone-700 transition-colors line-clamp-1 mb-2">
          {journal.title}
        </h3>

        {/* Summary Snippet */}
        <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed mb-3">
          {journal.summary}
        </p>
      </div>

      {/* Footer: Tags & Open Action */}
      <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap overflow-hidden max-h-6">
          {journal.tags && journal.tags.length > 0 ? (
            journal.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                className="inline-flex items-center gap-1 text-[11px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded"
              >
                <Tag className="w-2.5 h-2.5 text-stone-400" />
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-stone-400">No tags</span>
          )}
          {journal.tags && journal.tags.length > 3 && (
            <span className="text-[10px] text-stone-400">+{journal.tags.length - 3}</span>
          )}
        </div>

        <div className="flex items-center text-stone-400 group-hover:text-stone-800 transition-colors shrink-0">
          <span className="text-[11px] font-medium hidden sm:inline mr-0.5">Read</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
