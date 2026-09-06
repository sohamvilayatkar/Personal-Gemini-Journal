import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, X, Loader2, Calendar } from 'lucide-react';
import type { Conversation } from '../../shared/types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  loading: boolean;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onCloseMobile?: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  loading,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onCloseMobile,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Group conversations into Today and Earlier
  const today = new Date().toDateString();
  const todayConversations: Conversation[] = [];
  const earlierConversations: Conversation[] = [];

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updatedAt).toDateString();
    if (convDate === today) {
      todayConversations.push(conv);
    } else {
      earlierConversations.push(conv);
    }
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this reflection session? All messages will be permanently removed.')) {
      setDeletingId(id);
      try {
        await onDeleteConversation(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const renderItem = (conv: Conversation) => {
    const isActive = conv.id === activeConversationId;
    const isDeleting = conv.id === deletingId;

    return (
      <div
        key={conv.id}
        id={`sidebar-conv-${conv.id}`}
        onClick={() => onSelectConversation(conv.id)}
        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
          isActive
            ? 'bg-stone-900 text-white font-medium shadow-xs'
            : 'text-stone-700 hover:bg-stone-200/70'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-stone-400'}`} />
          <div className="truncate">
            <p className="truncate text-xs">{conv.title || 'New Reflection'}</p>
            <span className={`text-[10px] font-mono ${isActive ? 'text-stone-300' : 'text-stone-400'}`}>
              {conv.messageCount} {conv.messageCount === 1 ? 'turn' : 'turns'}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={isDeleting}
          onClick={(e) => handleDelete(e, conv.id)}
          title="Delete reflection"
          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-red-500 cursor-pointer ${
            isActive ? 'hover:bg-stone-800 text-stone-400' : 'hover:bg-stone-300 text-stone-500'
          }`}
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    );
  };

  return (
    <aside className="w-72 bg-stone-100/90 border-r border-stone-200 flex flex-col h-full select-none">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-stone-900 text-white flex items-center justify-center font-bold text-xs">
            J
          </div>
          <span className="text-xs font-semibold text-stone-900 uppercase tracking-wider">Reflections</span>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1 rounded-md text-stone-500 hover:bg-stone-200 md:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New Reflection Button */}
      <div className="p-3">
        <button
          type="button"
          id="btn-new-reflection"
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold bg-white hover:bg-stone-50 text-stone-900 border border-stone-200 rounded-xl shadow-2xs transition-all cursor-pointer hover:border-stone-300"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Reflection</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {loading && conversations.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-stone-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading reflections...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500 space-y-1">
            <p className="font-medium text-stone-700">No reflections yet</p>
            <p className="text-[11px]">Start a new conversation to explore your thoughts.</p>
          </div>
        ) : (
          <>
            {todayConversations.length > 0 && (
              <div className="space-y-1">
                <span className="px-2 text-[10px] font-semibold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Today
                </span>
                {todayConversations.map(renderItem)}
              </div>
            )}

            {earlierConversations.length > 0 && (
              <div className="space-y-1">
                <span className="px-2 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                  Earlier
                </span>
                {earlierConversations.map(renderItem)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-stone-200 text-[10px] text-stone-500 font-mono text-center">
        Firestore Isolated • Multi-Turn Active
      </div>
    </aside>
  );
};
