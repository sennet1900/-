
import React, { useState, useEffect, useRef } from 'react';
import { Annotation, Persona, EngineConfig } from '../types';

interface AnnotationActionModalProps {
  annotation: Annotation;
  persona: Persona;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onTriggerAI: (message: string, history: {role: string, text: string}[]) => void; // New Prop
  isProcessing?: boolean; // New Prop
  engineConfig: EngineConfig;
  isOriginal?: boolean;
}

const Avatar: React.FC<{ avatar: string; className?: string }> = ({ avatar, className = "w-10 h-10" }) => {
  const safeAvatar = avatar || '👤';
  const isImage = safeAvatar.startsWith('data:');
  return (
    <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-stone-100 border border-stone-200/50 shadow-sm`}>
      {isImage ? (
        <img src={safeAvatar} className="w-full h-full object-cover" alt="Avatar" />
      ) : (
        <span className="text-lg">{safeAvatar}</span>
      )}
    </div>
  );
};

const AnnotationModal: React.FC<AnnotationActionModalProps> = ({ 
  annotation, 
  persona, 
  onClose, 
  onUpdate, 
  onTriggerAI,
  isProcessing = false,
  engineConfig, 
  isOriginal = false 
}) => {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTextExpanded, setIsTextExpanded] = useState(false); // State for toggling text truncation
  const scrollRef = useRef<HTMLDivElement>(null);

  // Determine annotation font
  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  useEffect(() => {
    if (annotation.chatHistory) {
      setMessages(annotation.chatHistory);
    } else {
        // Fallback for very old data or initialization edge cases
        if (annotation.author === 'user') {
             setMessages([{ role: 'user', text: annotation.comment }]);
        } else {
             setMessages([{ role: 'model', text: annotation.comment }]);
        }
    }
  }, [annotation.chatHistory, annotation.comment, annotation.author]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);
  
  const handleSend = async (triggerAI: boolean) => {
    if (isProcessing) return;
    
    // Allow empty input ONLY if triggerAI is true (Reply button)
    if (!input.trim() && !triggerAI) return;

    let nextHistory = [...messages];
    
    // 1. If there is input, add it to history first
    if (input.trim()) {
      const userMsg = input;
      setInput('');
      // Optimistic update locally (App.tsx will also update props, but this feels faster)
      nextHistory = [...messages, { role: 'user', text: userMsg }];
      setMessages(nextHistory);
      // We don't necessarily need to call onUpdate here if onTriggerAI handles it,
      // but for "Record Only" (triggerAI=false), we must save.
      if (!triggerAI) {
         onUpdate(annotation.id, { chatHistory: nextHistory });
      }
    } else if (triggerAI) {
      // Input is empty, but user clicked Reply. 
      const lastMsg = nextHistory[nextHistory.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') return;
    }

    if (triggerAI) {
        onTriggerAI(input.trim() ? input : "", messages); // pass 'messages' which is state before optimistic update
        // Clear input again just in case
        setInput('');
    }
  };

  const handleRewrite = () => {
    if (isProcessing || messages.length === 0) return;
    
    // 1. Remove the last message (which should be AI's)
    const historyWithoutLast = messages.slice(0, -1);
    
    // 2. Update local state immediately to show it vanished
    setMessages(historyWithoutLast);

    // 3. Trigger AI with this truncated history. 
    // We pass empty string as "newMessage" so it generates response to existing history.
    onTriggerAI("", historyWithoutLast);
  };

  // Determine if Send button should be enabled
  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';
  
  const canTriggerAI = !isProcessing && (input.trim().length > 0 || lastMessageIsUser);
  const canRecordOnly = !isProcessing && input.trim().length > 0;

  return (
    // Changed positioning: items-start pt-20 on mobile to anchor top and prevent jumping when keyboard opens
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-20 md:items-center md:pt-0 p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden border border-stone-100 rounded-2xl shadow-2xl relative animate-scaleIn">
        
        {/* Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <Avatar avatar={persona.avatar} className="w-12 h-12 text-2xl" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-stone-900 text-base">{persona.name}</h4>
                <div className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <i className="fa-regular fa-heart"></i>
                  {isOriginal ? '心灵连接' : '共读中'}
                </div>
              </div>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest truncate max-w-[200px]">
                {persona.role} · {persona.relationship}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {/* User Avatar Here */}
             <div className="flex flex-col items-end mr-1">
                 <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{persona.userIdentity || '你'}</span>
                 <Avatar avatar={persona.userAvatar || '👤'} className="w-8 h-8 text-sm" />
             </div>
             
             <div className="h-8 w-px bg-stone-200"></div>

             <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-stone-200 rounded-full text-stone-400 transition-colors">
                <i className="fa-solid fa-xmark text-lg"></i>
             </button>
          </div>
        </div>

        {/* Selected Text (Truncated) */}
        <div className="bg-stone-50 p-2 border-b border-stone-100 shrink-0 shadow-inner">
          <div 
            onClick={() => setIsTextExpanded(!isTextExpanded)}
            className={`text-stone-500 italic text-xs md:text-sm border-l-4 border-amber-400 pl-2 cursor-pointer transition-all bg-white py-1.5 px-3 rounded-r-lg leading-relaxed ${isTextExpanded ? '' : 'line-clamp-2'}`}
            title={isTextExpanded ? "点击折叠" : "点击展开"}
          >
            "{annotation.textSelection}"
          </div>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#f2f2f2]" // Using a slight grey bg for chat feel
        >
          {messages.map((m, i) => {
             const isLast = i === messages.length - 1;
             const isAI = m.role === 'model';
             return (
              <div key={i} className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'} items-start gap-3 group`}>
                {/* AI Avatar (Left) */}
                {isAI && <Avatar avatar={persona.avatar} className="w-10 h-10 text-xl mt-0.5" />}
                
                <div className={`relative max-w-[85%] ${isAI ? '' : ''}`}>
                  <div 
                    className={`px-4 py-3 text-sm shadow-sm leading-relaxed whitespace-pre-wrap ${
                      isAI 
                        ? 'bg-white text-stone-800 rounded-2xl rounded-tl-[2px] border border-stone-200' 
                        : 'bg-[#95ec69] text-stone-900 rounded-2xl rounded-tr-[2px] border border-[#8ad961]' // WeChat Green-ish
                    }`}
                    style={{ fontFamily: !isAI ? engineConfig.userFont : annotationFont }}
                  >
                    {m.text}
                  </div>
                  
                  {/* Rewrite Button (Only for last message if it is AI) */}
                  {isLast && isAI && !isProcessing && (
                     <button 
                       onClick={handleRewrite}
                       className="absolute -right-8 top-2 w-6 h-6 flex items-center justify-center text-stone-300 hover:text-amber-500 hover:rotate-180 transition-all rounded-full opacity-0 group-hover:opacity-100"
                       title="重写回复"
                     >
                       <i className="fa-solid fa-rotate-right text-xs"></i>
                     </button>
                  )}
                </div>
              </div>
             );
          })}
          
          {/* Loading Indicator */}
          {isProcessing && (
            <div className="flex justify-start items-start gap-3 animate-fadeIn">
              <Avatar avatar={persona.avatar} className="w-10 h-10 text-xl mt-0.5" />
              <div className="bg-white p-4 rounded-2xl rounded-tl-[2px] flex gap-1.5 border border-stone-200 shadow-sm items-center h-10">
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 shrink-0">
          <div className="relative flex items-end gap-2 bg-white rounded-3xl border border-stone-200 px-2 py-2 shadow-sm focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-400 transition-all">
            <textarea 
              rows={1}
              value={input}
              onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-grow
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(true);
                  }
              }}
              placeholder={isOriginal ? `告诉 ${persona.name} 你的想法...` : `回复...`}
              className="w-full bg-transparent border-none py-2 px-3 focus:outline-none text-sm resize-none max-h-[120px] custom-scrollbar"
              style={{ minHeight: '36px' }}
            />
            
            <div className="flex items-center gap-1 pb-1">
               {/* Record Only (Right Button) */}
              <button 
                onClick={() => handleSend(false)}
                disabled={!canRecordOnly}
                className="w-8 h-8 flex items-center justify-center bg-stone-100 text-stone-400 rounded-full hover:bg-stone-200 disabled:opacity-30 transition-colors"
                title="仅记录笔记 (不回复)"
              >
                <i className="fa-solid fa-pen text-xs"></i>
              </button>

              {/* Send and Reply (Left Button) */}
              <button 
                onClick={() => handleSend(true)}
                disabled={!canTriggerAI}
                className="w-8 h-8 flex items-center justify-center bg-amber-500 text-white rounded-full hover:bg-amber-600 disabled:opacity-50 disabled:bg-stone-300 transition-colors shadow-md"
                title="发送"
              >
                <i className="fa-solid fa-paper-plane text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default AnnotationModal;
