import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AuthButton } from '../components/AuthButton';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { ChatMessageBubble } from '../components/ChatMessageBubble';
import { ChatInput } from '../components/ChatInput';
import { EmptyChatState } from '../components/EmptyChatState';
import { ChatClientService } from '../services/chatService';
import { JournalClientService } from '../services/journalClientService';
import { JournalListPage } from './JournalListPage';
import { JournalDetailView } from '../components/JournalDetailView';
import { MemoryManager } from '../components/MemoryManager';
import { MemoryCandidateModal } from '../components/MemoryCandidateModal';
import { MemoryClientService } from '../services/memoryClientService';
import { ClientFirestoreService } from '../services/firestoreService';
import { InsightView } from '../components/InsightView';
import type { Conversation, ConversationMessage, JournalEntry, MemoryCandidate, MemoryCategory } from '../../shared/types';
import {
  Menu,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  BookOpen,
  MessageSquare,
  Loader2,
  Brain,
  Lightbulb,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

export const JournalChatPage: React.FC = () => {
  const { user, getIdToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'journals' | 'memories' | 'insights'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [iamConfigError, setIamConfigError] = useState<{
    serviceAccount: string;
    targetProject: string;
    targetDatabase: string;
    requiredRole: string;
    iamConsoleUrl: string;
  } | null>(null);
  const [copiedSa, setCopiedSa] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Chat mode state (Reflective Chat vs Ask My Journal)
  const [chatMode, setChatMode] = useState<'reflect' | 'ask_journal'>('reflect');

  // Journal synthesis state
  const [isGeneratingJournal, setIsGeneratingJournal] = useState(false);
  const [journalStatusMessage, setJournalStatusMessage] = useState<string | null>(null);
  const [activeJournalDetail, setActiveJournalDetail] = useState<JournalEntry | null>(null);

  // Memory extraction state
  const [isExtractingMemories, setIsExtractingMemories] = useState(false);
  const [candidateMemories, setCandidateMemories] = useState<MemoryCandidate[] | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingReply]);

  // Load conversations directly from Cloud Firestore (authoritative Single Source of Truth)
  const loadConversations = async () => {
    if (!user) return;
    setLoadingConversations(true);
    setErrorMessage(null);
    try {
      // Primary: load directly from Cloud Firestore
      const directList = await ClientFirestoreService.listConversations(user.uid);
      setConversations(directList || []);
      if (directList && directList.length > 0 && !activeConversationId) {
        setActiveConversationId(directList[0].id);
      }
      setIamConfigError(null);
    } catch (fsErr: any) {
      console.warn('Could not read conversations directly from Firestore, checking backend fallback:', fsErr);
      try {
        const token = await getIdToken();
        if (token) {
          const list = await ChatClientService.listConversations(token);
          if (list && list.length > 0) {
            setConversations(list);
            if (!activeConversationId) {
              setActiveConversationId(list[0].id);
            }
          }
        }
      } catch (err: any) {
        if (err.code === 'FIRESTORE_PERMISSION_DENIED' && err.details) {
          setIamConfigError(err.details);
        } else {
          setErrorMessage(fsErr?.message || err?.message || 'Could not load reflections.');
        }
      }
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [user]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!user || !activeConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    const fetchMessages = async () => {
      setLoadingMessages(true);
      setErrorMessage(null);
      try {
        // Direct read from Firestore as primary source
        const directMessages = await ClientFirestoreService.listMessages(user.uid, activeConversationId);
        if (isMounted) {
          setMessages(directMessages || []);
        }
      } catch (fsErr: any) {
        console.warn('Could not read messages directly from Firestore:', fsErr);
        try {
          const token = await getIdToken();
          if (token && isMounted) {
            const history = await ChatClientService.listMessages(token, activeConversationId);
            if (isMounted) {
              setMessages(history || []);
            }
          }
        } catch (err: any) {
          if (isMounted) {
            if (err.code === 'FIRESTORE_PERMISSION_DENIED' && err.details) {
              setIamConfigError(err.details);
            } else {
              setErrorMessage(fsErr?.message || err.message || 'Could not load message history.');
            }
          }
        }
      } finally {
        if (isMounted) {
          setLoadingMessages(false);
        }
      }
    };

    fetchMessages();

    return () => {
      isMounted = false;
    };
  }, [activeConversationId, user]);

  // Handle new conversation creation - persistent in Firestore
  const handleNewConversation = async () => {
    if (!user) return;
    try {
      const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date().toISOString();
      const newConv: Conversation = {
        id: convId,
        title: 'New Reflection',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        messageCount: 0,
        archived: false,
      };

      // Persist directly to Cloud Firestore as authoritative source
      await ClientFirestoreService.saveConversation(user.uid, newConv);

      // Also notify backend if authenticated
      const token = await getIdToken().catch(() => null);
      if (token) {
        ChatClientService.createConversation(token, 'New Reflection').catch((err) => {
          console.warn('Backend createConversation notification:', err);
        });
      }

      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setActiveTab('chat');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create a new reflection.');
    }
  };

  // Handle conversation deletion
  const handleDeleteConversation = async (conversationId: string) => {
    if (!user) return;
    try {
      // Delete directly from Cloud Firestore
      await ClientFirestoreService.deleteConversation(user.uid, conversationId);

      // Also notify backend
      const token = await getIdToken().catch(() => null);
      if (token) {
        ChatClientService.deleteConversation(token, conversationId).catch(console.warn);
      }

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      if (activeConversationId === conversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        setMessages([]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete reflection.');
    }
  };

  // Handle message submission
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming || !user) return;

    setInputMessage('');
    setErrorMessage(null);

    // If no active conversation, create one first
    let targetConvId = activeConversationId;
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication required');

      if (!targetConvId) {
        const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date().toISOString();
        const initialTitle = text.slice(0, 36).trim() || 'New Reflection';
        const newConv: Conversation = {
          id: convId,
          title: initialTitle,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          messageCount: 0,
          archived: false,
        };
        await ClientFirestoreService.saveConversation(user.uid, newConv);
        targetConvId = convId;
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);

        if (token) {
          ChatClientService.createConversation(token, initialTitle).catch(console.warn);
        }
      }

      // Handle Ask My Journal Q&A mode
      if (chatMode === 'ask_journal') {
        const optimisticUserMsg: ConversationMessage = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
          isJournalQuery: true,
        };
        setMessages((prev) => [...prev, optimisticUserMsg]);
        setIsStreaming(true);
        setStreamingReply('');

        try {
          const result = await JournalClientService.askJournal(token, text);
          setIsStreaming(false);

          const modelMsg: ConversationMessage = {
            id: `msg-${Date.now()}`,
            role: 'model',
            content: result.answer,
            createdAt: new Date().toISOString(),
            isJournalQuery: true,
            sources: result.sources,
          };
          setMessages((prev) => [...prev, modelMsg]);

          if (user?.uid && targetConvId) {
            ClientFirestoreService.saveMessage(user.uid, targetConvId, optimisticUserMsg).catch(console.error);
            ClientFirestoreService.saveMessage(user.uid, targetConvId, modelMsg).catch(console.error);
          }

          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvId ? { ...c, messageCount: (c.messageCount || 0) + 2 } : c
            )
          );
        } catch (askErr: any) {
          setIsStreaming(false);
          setErrorMessage(askErr.message || 'Failed to query your journal history.');
        }
        return;
      }

      // Optimistically append user message
      const optimisticUserMsg: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      setIsStreaming(true);
      setStreamingReply('');

      abortControllerRef.current = new AbortController();
      let matchedCount: number | undefined;

      await ChatClientService.streamChat(token, {
        conversationId: targetConvId,
        message: text,
        signal: abortControllerRef.current.signal,
        onStart: (serverUserMsg, meta) => {
          if (typeof meta?.matchedMemoriesCount === 'number' && meta.matchedMemoriesCount > 0) {
            matchedCount = meta.matchedMemoriesCount;
          }
          if (serverUserMsg?.id) {
            optimisticUserMsg.id = serverUserMsg.id;
          }
        },
        onChunk: (chunk) => {
          setStreamingReply((prev) => prev + chunk);
        },
        onDone: (fullMessage, serverModelMsg, meta) => {
          setIsStreaming(false);
          setStreamingReply('');

          const count = typeof meta?.matchedMemoriesCount === 'number' && meta.matchedMemoriesCount > 0
            ? meta.matchedMemoriesCount
            : (typeof matchedCount === 'number' && matchedCount > 0 ? matchedCount : undefined);

          const modelMsg: ConversationMessage = {
            id: serverModelMsg?.id || `msg-${Date.now()}`,
            role: 'model',
            content: fullMessage,
            createdAt: serverModelMsg?.createdAt || new Date().toISOString(),
            ...(count ? { matchedMemoriesCount: count } : {}),
          };
          setMessages((prev) => [...prev, modelMsg]);

          // Persist messages and conversation metadata directly to Firestore
          if (user?.uid && targetConvId) {
            ClientFirestoreService.saveMessage(user.uid, targetConvId, optimisticUserMsg).catch(console.error);
            ClientFirestoreService.saveMessage(user.uid, targetConvId, modelMsg).catch(console.error);
            ClientFirestoreService.updateConversation(user.uid, targetConvId, {
              updatedAt: new Date().toISOString(),
              lastMessageAt: new Date().toISOString(),
              messageCount: (messages.length + 2),
            }).catch(console.error);
          }

          // Update message count in conversation list
          setConversations((prev) =>
            prev.map((c) =>
              c.id === targetConvId ? { ...c, messageCount: (c.messageCount || 0) + 2 } : c
            )
          );
        },
        onError: (err) => {
          setIsStreaming(false);
          setStreamingReply('');
          setErrorMessage(err.message || 'An error occurred during Gemini reflection streaming.');
        },
      });
    } catch (err: any) {
      setIsStreaming(false);
      setStreamingReply('');
      setErrorMessage(err.message || 'Failed to communicate with reflection assistant.');
    }
  };

  // Handle aborting active streaming
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (streamingReply) {
      const partialMsg: ConversationMessage = {
        id: `msg-${Date.now()}`,
        role: 'model',
        content: streamingReply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, partialMsg]);
      setStreamingReply('');
    }
  };

  // Handle AI Journal Generation
  const handleGenerateJournal = async () => {
    if (!user || !activeConversationId || isGeneratingJournal || messages.length === 0) {
      return;
    }

    setIsGeneratingJournal(true);
    setJournalStatusMessage('Synthesizing structured journal with Gemini...');
    setErrorMessage(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication required');

      const msgContext = messages
        .filter((m) => m.content && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.trim() }));

      const result = await JournalClientService.generateJournal(
        token,
        activeConversationId,
        false,
        msgContext
      );

      setJournalStatusMessage(
        result.alreadyExists
          ? 'Journal entry already exists for this reflection.'
          : 'Journal entry synthesized successfully.'
      );

      // Persist directly to Cloud Firestore (Single Source of Truth)
      if (user?.uid && result.journal) {
        try {
          await ClientFirestoreService.saveJournal(user.uid, result.journal);
        } catch (saveErr) {
          console.error('Could not save journal to Firestore:', saveErr);
        }
      }

      // Open detail view for review and user editing
      setActiveJournalDetail(result.journal);
    } catch (err: any) {
      let userMsg = 'Failed to generate journal entry. Please try again.';
      if (err.status === 429) {
        userMsg = err.retryAfter
          ? `Journal generation rate limit reached. Please retry in ${err.retryAfter}s.`
          : 'Journal generation rate limit reached. Please wait a moment before trying again.';
      } else if (err.code === 'CANNOT_SYNTHESIZE_EMPTY_CONVERSATION') {
        userMsg = 'Cannot synthesize a journal entry from an empty reflection.';
      } else if (err.code === 'AI_SYNTHESIS_MALFORMED') {
        userMsg = 'AI reflection produced malformed structure. Please retry.';
      } else if (err.message) {
        userMsg = err.message;
      }
      setErrorMessage(userMsg);
    } finally {
      setIsGeneratingJournal(false);
      setTimeout(() => setJournalStatusMessage(null), 4000);
    }
  };

  // Handle AI Memory Extraction (User-Consent Guided)
  const handleExtractMemories = async () => {
    if (!user || !activeConversationId || isExtractingMemories || messages.length === 0) {
      return;
    }

    setIsExtractingMemories(true);
    setJournalStatusMessage('Analyzing reflection with Gemini for candidate memories...');
    setErrorMessage(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication required');

      const candidates = await MemoryClientService.extractCandidates(token, activeConversationId);
      if (candidates.length === 0) {
        setJournalStatusMessage('Gemini found no enduring memories to suggest from this reflection.');
      } else {
        setCandidateMemories(candidates);
        setJournalStatusMessage(null);
      }
    } catch (err: any) {
      let userMsg = 'Failed to extract candidate memories. Please try again.';
      if (err.status === 429) {
        userMsg = 'Memory extraction rate limit reached (5 requests/minute). Please wait a moment.';
      } else if (err.message) {
        userMsg = err.message;
      }
      setErrorMessage(userMsg);
    } finally {
      setIsExtractingMemories(false);
      setTimeout(() => setJournalStatusMessage(null), 4000);
    }
  };

  // Callback when user explicitly approves and saves a candidate memory
  const handleSaveApprovedCandidate = async (candidate: {
    content: string;
    category: MemoryCategory;
    sourceConversationId: string;
    confidence: number;
  }) => {
    if (!user) return;
    const token = await getIdToken();
    if (!token) throw new Error('Authentication required');

    const created = await MemoryClientService.createMemory(token, {
      content: candidate.content,
      category: candidate.category,
      sourceConversationId: candidate.sourceConversationId,
      confidence: candidate.confidence,
      provenance: 'ai_suggested',
    });
    if (user?.uid && created) {
      ClientFirestoreService.saveMemory(user.uid, created).catch(console.error);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-100 font-sans antialiased text-stone-900">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-stone-900/40 z-20 md:hidden backdrop-blur-2xs"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar: Desktop + Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-30 md:static md:flex transform transition-transform duration-200 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          loading={loadingConversations}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setActiveTab('chat');
            setIsMobileSidebarOpen(false);
          }}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-stone-50">
        {/* Chat / Journal Top Header */}
        <header className="h-14 border-b border-stone-200 bg-white/95 px-4 sm:px-6 flex items-center justify-between shadow-2xs z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 md:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Navigation Tabs */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
              <button
                type="button"
                id="tab-reflections"
                onClick={() => setActiveTab('chat')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Reflections</span>
              </button>
              <button
                type="button"
                id="tab-journals"
                onClick={() => setActiveTab('journals')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'journals'
                    ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Journal Entries</span>
              </button>
              <button
                type="button"
                id="tab-memories"
                onClick={() => setActiveTab('memories')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'memories'
                    ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Memory Bank</span>
              </button>
              <button
                type="button"
                id="tab-insights"
                onClick={() => setActiveTab('insights')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === 'insights'
                    ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Insights & Reflections</span>
              </button>
            </div>

            {activeTab === 'chat' && activeConversation && (
              <div className="hidden lg:flex items-center gap-2 truncate pl-2 border-l border-stone-200">
                <span className="text-xs font-medium text-stone-700 truncate max-w-xs">
                  {activeConversation.title}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  <ShieldCheck className="w-3 h-3" />
                  Isolated
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Extract Memories Button (when in chat mode) */}
            {activeTab === 'chat' && activeConversationId && (
              <button
                type="button"
                id="extract-memories-button"
                onClick={handleExtractMemories}
                disabled={isExtractingMemories || isStreaming || messages.length === 0}
                title={
                  messages.length === 0
                    ? 'Add at least one message to extract candidate memories'
                    : 'Ask Gemini to identify enduring candidate memories for your review'
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              >
                {isExtractingMemories ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5 text-purple-600" />
                    <span>Suggest Memories</span>
                  </>
                )}
              </button>
            )}

            {/* Generate Journal Button (when in chat mode) */}
            {activeTab === 'chat' && activeConversationId && (
              <button
                type="button"
                id="generate-journal-button"
                onClick={handleGenerateJournal}
                disabled={isGeneratingJournal || isStreaming || messages.length === 0}
                title={
                  messages.length === 0
                    ? 'Add at least one message to synthesize a journal'
                    : 'Synthesize this reflection into a structured journal entry'
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              >
                {isGeneratingJournal ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-700" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Generate Journal</span>
                  </>
                )}
              </button>
            )}

            <AuthButton />
          </div>
        </header>

        {/* IAM Permission Denied Setup Guidance Banner */}
        {iamConfigError && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-3 text-stone-900 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-amber-900">
                    Google Cloud Action Required: Grant Firestore IAM Permission
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIamConfigError(null)}
                    className="text-xs text-amber-800 hover:text-amber-950 font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-amber-950/80 leading-relaxed">
                  The backend service account cannot read or write to named Firestore database{' '}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px] font-semibold text-amber-900">
                    {iamConfigError.targetDatabase}
                  </code>{' '}
                  in project{' '}
                  <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px] font-semibold text-amber-900">
                    {iamConfigError.targetProject}
                  </code>{' '}
                  because it requires the <strong className="font-semibold">Cloud Datastore User</strong> IAM role.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-medium text-stone-600">Runtime Service Account:</span>
                  <code className="bg-white border border-amber-300 px-2 py-0.5 rounded text-[11px] font-mono text-stone-800 select-all">
                    {iamConfigError.serviceAccount}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(iamConfigError.serviceAccount);
                      setCopiedSa(true);
                      setTimeout(() => setCopiedSa(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 rounded px-2 py-0.5 cursor-pointer shadow-2xs"
                  >
                    {copiedSa ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSa ? 'Copied!' : 'Copy Email'}</span>
                  </button>

                  <a
                    href={iamConfigError.iamConsoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900 bg-amber-100/70 hover:bg-amber-200 border border-amber-300 rounded px-2.5 py-0.5 cursor-pointer transition-colors"
                  >
                    <span>Open GCP IAM Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => loadConversations()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-stone-900 hover:bg-stone-800 rounded px-2.5 py-0.5 cursor-pointer transition-colors shadow-2xs"
                  >
                    <span>Retry Connection</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 text-xs px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-700 font-bold hover:text-red-900 cursor-pointer ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Non-blocking Status Banner for Journal/Memory Operations */}
        {journalStatusMessage && (
          <div className="bg-purple-50 border-b border-purple-200 text-purple-800 text-xs px-4 py-2 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              {isGeneratingJournal || isExtractingMemories ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              )}
              <span>{journalStatusMessage}</span>
            </div>
            {!isGeneratingJournal && !isExtractingMemories && (
              <button
                type="button"
                onClick={() => setJournalStatusMessage(null)}
                className="text-purple-700 hover:text-purple-900 cursor-pointer font-medium"
              >
                Close
              </button>
            )}
          </div>
        )}

        {/* Active Tab View */}
        {activeTab === 'journals' ? (
          <JournalListPage
            onNavigateToChat={(convId) => {
              if (convId) {
                setActiveConversationId(convId);
              }
              setActiveTab('chat');
            }}
          />
        ) : activeTab === 'memories' ? (
          <div className="flex-1 overflow-y-auto">
            <MemoryManager />
          </div>
        ) : activeTab === 'insights' ? (
          <div className="flex-1 overflow-y-auto">
            <InsightView />
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
            {/* Message Feed Area */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              <div className="max-w-3xl mx-auto">
                {loadingMessages ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2 text-xs text-stone-400">
                    <Sparkles className="w-5 h-5 animate-spin text-stone-400" />
                    <span>Retrieving conversation turns securely...</span>
                  </div>
                ) : messages.length === 0 && !isStreaming ? (
                  <EmptyChatState onSelectStarter={(starter) => handleSendMessage(starter)} />
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <ChatMessageBubble key={msg.id} message={msg} />
                    ))}

                    {/* Live Streaming Message Turn */}
                    {isStreaming && streamingReply && (
                      <ChatMessageBubble
                        message={{
                          id: 'streaming-active',
                          role: 'model',
                          content: streamingReply,
                          createdAt: new Date().toISOString(),
                        }}
                        isStreaming={true}
                      />
                    )}

                    {/* Thinking / generating indicator */}
                    {isStreaming && !streamingReply && (
                      <div className="flex items-center gap-2 text-xs text-stone-400 py-2 pl-3">
                        <span className="w-2 h-2 rounded-full bg-stone-400 animate-ping" />
                        <span>Gemini is reflecting...</span>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Input Area */}
            <div className="border-t border-stone-200/80 bg-white/70 backdrop-blur-xs">
              <ChatInput
                input={inputMessage}
                isStreaming={isStreaming}
                disabled={loadingMessages}
                mode={chatMode}
                onModeChange={setChatMode}
                onChange={setInputMessage}
                onSend={() => handleSendMessage()}
                onStop={handleStopGeneration}
              />
            </div>
          </div>
        )}
      </div>

      {/* Active Journal Detail Modal */}
      {activeJournalDetail && (
        <JournalDetailView
          journal={activeJournalDetail}
          onClose={() => setActiveJournalDetail(null)}
          onUpdated={(updated) => setActiveJournalDetail(updated)}
          onDeleted={() => setActiveJournalDetail(null)}
          onJumpToConversation={(convId) => {
            setActiveJournalDetail(null);
            setActiveConversationId(convId);
            setActiveTab('chat');
          }}
        />
      )}

      {/* Candidate Memory Review Modal */}
      {candidateMemories && activeConversationId && (
        <MemoryCandidateModal
          candidates={candidateMemories}
          conversationId={activeConversationId}
          onClose={() => setCandidateMemories(null)}
          onSave={handleSaveApprovedCandidate}
        />
      )}
    </div>
  );
};
