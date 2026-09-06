import React, { useState } from 'react';
import { Sparkles, User, BookOpen, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import type { ConversationMessage } from '../../shared/types';

interface ChatMessageBubbleProps {
  message: ConversationMessage;
  isStreaming?: boolean;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, isStreaming }) => {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'user';
  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    return (
      <div id={`message-user-${message.id}`} className="flex justify-end mb-4">
        <div className="max-w-[85%] md:max-w-[70%] flex items-end gap-2">
          <div className="flex flex-col items-end">
            <div className={`rounded-2xl rounded-br-xs px-4 py-3 shadow-2xs ${
              message.isJournalQuery 
                ? 'bg-amber-900 text-amber-50 border border-amber-800' 
                : 'bg-stone-900 text-stone-100'
            }`}>
              {message.isJournalQuery && (
                <div className="flex items-center gap-1 text-[10px] text-amber-300 font-medium mb-1">
                  <BookOpen className="w-3 h-3" />
                  <span>Ask My Journal Query</span>
                </div>
              )}
              <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed font-sans">
                {message.content}
              </p>
            </div>
            <span className="text-[10px] text-stone-400 mt-1 mr-1 font-mono">{formattedTime}</span>
          </div>
          <div className="w-6 h-6 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center shrink-0 mb-4">
            <User className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`message-model-${message.id}`} className="flex justify-start mb-4">
      <div className="max-w-[90%] md:max-w-[80%] flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
          message.isJournalQuery
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-stone-100 border-stone-200 text-stone-700'
        }`}>
          {message.isJournalQuery ? (
            <BookOpen className="w-3.5 h-3.5 text-amber-700" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-stone-700" />
          )}
        </div>
        <div className="flex-1 flex flex-col">
          <div className={`bg-white border rounded-2xl rounded-tl-xs px-4 py-3.5 shadow-2xs text-stone-800 ${
            message.isJournalQuery ? 'border-amber-200/90' : 'border-stone-200/90'
          }`}>
            <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed font-sans">
              {message.content}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-stone-600 animate-pulse align-middle" />
              )}
            </p>

            {/* Sources Accordion for Ask My Journal Responses */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowSources(!showSources)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 hover:text-amber-950 cursor-pointer"
                >
                  <BookOpen className="w-3 h-3 text-amber-600" />
                  <span>{message.sources.length} Referenced {message.sources.length === 1 ? 'Entry' : 'Entries'}</span>
                  {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showSources && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                    {message.sources.map((s, idx) => (
                      <div key={idx} className="bg-amber-50/60 border border-amber-200/70 rounded-lg p-2 text-left">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-amber-950">
                          <span className="truncate">{s.title}</span>
                          <span className="text-[10px] text-amber-700 font-normal shrink-0 ml-2">{s.date}</span>
                        </div>
                        <p className="text-[11px] text-stone-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {s.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 ml-1">
            <span className="text-[10px] text-stone-500 font-medium">
              {message.isJournalQuery ? 'Grounded Journal Answer' : 'Gemini Reflection'}
            </span>
            {message.matchedMemoriesCount !== undefined && message.matchedMemoriesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 bg-purple-50 border border-purple-200/80 px-1.5 py-0.5 rounded-full font-medium">
                <Brain className="w-2.5 h-2.5" />
                <span>Personalized with {message.matchedMemoriesCount} {message.matchedMemoriesCount === 1 ? 'memory' : 'memories'}</span>
              </span>
            )}
            <span className="text-[10px] text-stone-400 font-mono">• {formattedTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
