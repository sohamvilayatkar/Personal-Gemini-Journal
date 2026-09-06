import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square, Loader2, Sparkles, BookOpen } from 'lucide-react';

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  disabled?: boolean;
  mode?: 'reflect' | 'ask_journal';
  onModeChange?: (mode: 'reflect' | 'ask_journal') => void;
  onChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
}

const MAX_CHAR_LIMIT = 4000;

const ASK_JOURNAL_SUGGESTIONS = [
  'What was I working on recently?',
  'What goals have I mentioned?',
  'What did I write about my project?',
  'What was bothering me last week?',
  'What achievements did I log?',
];

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  isStreaming,
  disabled,
  mode = 'reflect',
  onModeChange,
  onChange,
  onSend,
  onStop,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim() && !disabled) {
        onSend();
      }
    }
  };

  const remainingChars = MAX_CHAR_LIMIT - input.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 pt-1">
      {/* Mode Selector & Suggestions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="inline-flex p-0.5 bg-stone-100 rounded-lg border border-stone-200 shadow-2xs self-start">
          <button
            type="button"
            onClick={() => onModeChange?.('reflect')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              mode === 'reflect'
                ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Reflective Chat</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange?.('ask_journal')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              mode === 'ask_journal'
                ? 'bg-white text-amber-900 shadow-2xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-600" />
            <span>Ask My Journal</span>
          </button>
        </div>

        {mode === 'ask_journal' && (
          <span className="text-[11px] text-amber-800 font-medium self-center">
            Answers are grounded strictly in your personal journals & memories
          </span>
        )}
      </div>

      {/* Suggestion Chips when in Ask My Journal mode */}
      {mode === 'ask_journal' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-1 scrollbar-none">
          <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider shrink-0 mr-0.5">
            Try asking:
          </span>
          {ASK_JOURNAL_SUGGESTIONS.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onChange(suggestion);
                textareaRef.current?.focus();
              }}
              className="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200/80 rounded-full px-2.5 py-0.5 whitespace-nowrap cursor-pointer transition-colors shrink-0"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className={`relative bg-white border focus-within:ring-1 rounded-2xl p-2.5 shadow-2xs transition-all ${
        mode === 'ask_journal'
          ? 'border-amber-300 focus-within:border-amber-500 focus-within:ring-amber-400'
          : 'border-stone-200 focus-within:border-stone-400 focus-within:ring-stone-400'
      }`}>
        <textarea
          ref={textareaRef}
          id="chat-input-textarea"
          value={input}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'ask_journal'
              ? "Ask anything about your past entries (e.g., 'What goals have I set recently?')..."
              : "Share what is on your mind... (Press Enter to send, Shift+Enter for newline)"
          }
          rows={1}
          maxLength={MAX_CHAR_LIMIT + 50}
          className="w-full text-xs sm:text-sm bg-transparent border-0 focus:outline-hidden focus:ring-0 resize-none text-stone-800 placeholder:text-stone-400 max-h-44 pr-12 pl-1 py-1"
        />

        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-stone-100">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono ${
                isOverLimit ? 'text-red-500 font-bold' : remainingChars < 200 ? 'text-amber-500' : 'text-stone-400'
              }`}
            >
              {input.length.toLocaleString()} / {MAX_CHAR_LIMIT.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <button
                type="button"
                id="btn-stop-generating"
                onClick={onStop}
                title="Stop generating"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl cursor-pointer transition-colors"
              >
                <Square className="w-3 h-3 fill-stone-700" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                id="btn-send-message"
                disabled={!input.trim() || disabled || isOverLimit}
                onClick={onSend}
                title={mode === 'ask_journal' ? 'Search journal history' : 'Send reflection'}
                className={`w-8 h-8 rounded-xl text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 shadow-xs ${
                  mode === 'ask_journal'
                    ? 'bg-amber-800 hover:bg-amber-900 disabled:hover:bg-amber-800'
                    : 'bg-stone-900 hover:bg-stone-800 disabled:hover:bg-stone-900'
                }`}
              >
                {disabled ? (
                  <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-[10px] text-stone-400 mt-2 font-mono">
        Gemini is a thoughtful reflection companion. All entries are encrypted & isolated to your account.
      </p>
    </div>
  );
};
