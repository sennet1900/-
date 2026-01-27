
import React, { useState, useEffect, useRef } from 'react';
import { Annotation, Persona, EngineConfig } from '../types';

interface AnnotationActionModalProps {
  annotation: Annotation;
  persona: Persona;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onTriggerAI: (message: string, history: {role: string, text: string}[]) => void;
  isProcessing?: boolean;
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
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  useEffect(() => {
    if (annotation.chatHistory) {
      setMessages(annotation.chatHistory);
    } else {
        if (annotation.author === 'user') {
             setMessages([{ role: 'user', text: annotation.comment }]);
        } else {
             setMessages([{ role: 'model', text: annotation.comment }]);
        }
    }
  }, [annotation.chatHistory, annotation.comment, annotation.author]);

  // --- STRICT BODY LOCK ---
  // Since we are taking over the full screen, we lock the body completely.
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);
  
  const handleSend = async (triggerAI: boolean) => {
    if (isProcessing) return;
    if (!input.trim() && !triggerAI) return;

    let nextHistory = [...messages];
    if (input.trim()) {
      const userMsg = input;
      setInput('');
      nextHistory = [...messages, { role: 'user', text: userMsg }];
      setMessages(nextHistory);
      if (!triggerAI) {
         onUpdate(annotation.id, { chatHistory: nextHistory });
      }
    } else if (triggerAI) {
      const lastMsg = nextHistory[nextHistory.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') return;
    }

    if (triggerAI) {
        onTriggerAI(input.trim() ? input : "", messages);
        setInput('');
    }
  };

  const handleRewrite = () => {
    if (isProcessing || messages.length === 0) return;
    const historyWithoutLast = messages.slice(0, -1);
    setMessages(historyWithoutLast);
    onTriggerAI("", historyWithoutLast);
  };

  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';
  const canTriggerAI = !isProcessing && (input.trim().length > 0 || lastMessageIsUser);
  const canRecordOnly = !isProcessing && input.trim().length > 0;

  return (
    // FULL SCREEN WRAPPER
    // Mobile: Occupies fixed inset-0 with solid background (looks like a page)
    // Desktop: Semi-transparent backdrop with centered modal
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-end sm:justify-center sm:bg-stone-900/60 sm:backdrop-blur-md">
      
      {/* Desktop Backdrop Click-to-close */}
      <div className="absolute inset-0 hidden sm:block" onClick={onClose} />

      {/* MAIN CONTAINER */}
      <div 
        className="relative w-full h-[100dvh] sm:h-[85vh] sm:max-w-lg bg-[#f2f2f2] sm:bg-white sm:rounded-2xl sm:shadow-2xl sm:overflow-hidden flex flex-col animate-fadeIn"
      >
        
        {/* 1. HEADER (Page-Like) */}
        <div className="shrink-0 bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-between shadow-sm z-20 safe-area-top">
          <button 
            onClick={onClose}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 active:scale-95 transition-all"
          >
             {/* Down arrow for mobile "sheet" feel, X for desktop */}
             <i className="fa-solid fa-chevron-down sm:hidden text-lg"></i>
             <i className="fa-solid fa-xmark hidden sm:block text-lg"></i>
          </button>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5">
               <span className="text-sm font-bold text-stone-900">{persona.name}</span>
               {isOriginal && <i className="fa-solid fa-heart text-amber-500 text-[10px]"></i>}
            </div>
            <span className="text-[10px] text-stone-400 font-medium">{persona.role}</span>
          </div>

          <div className="w-10 flex justify-end">
            <Avatar avatar={persona.userAvatar || '👤'} className="w-9 h-9 border border-stone-100" />
          </div>
        </div>

        {/* 2. QUOTE CONTEXT (Collapsible) */}
        <div 
           className="shrink-0 bg-white border-b border-stone-200 z-10"
           onClick={() => setIsTextExpanded(!isTextExpanded)}
        >
          <div className="px-4 py-3 flex gap-3 items-start cursor-pointer hover:bg-stone-50 transition-colors">
             <div className="w-1 self-stretch bg-amber-400 rounded-full shrink-0 my-1"></div>
             <div className={`flex-1 text-stone-600 text-sm leading-relaxed italic ${isTextExpanded ? '' : 'line-clamp-2'}`}>
                "{annotation.textSelection}"
             </div>
             <i className={`fa-solid fa-caret-down text-stone-300 text-xs mt-1 transition-transform ${isTextExpanded ? 'rotate-180' : ''}`}></i>
          </div>
        </div>

        {/* 3. CHAT AREA (Scrollable) */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#f2f2f2] sm:bg-[#f5f5f5]"
        >
          {messages.map((m, i) => {
             const isLast = i === messages.length - 1;
             const isAI = m.role === 'model';
             return (
              <div key={i} className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'} items-start gap-3 group animate-slideUp`}>
                {isAI && <Avatar avatar={persona.avatar} className="w-9 h-9 mt-1 shadow-sm" />}
                
                <div className={`relative max-w-[85%] ${isAI ? '' : ''}`}>
                  <div 
                    className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                      isAI 
                        ? 'bg-white text-stone-800 rounded-2xl rounded-tl-[2px] border border-stone-200/50' 
                        : 'bg-[#95ec69] text-stone-900 rounded-2xl rounded-tr-[2px] border border-[#8ad961]' 
                    }`}
                    style={{ fontFamily: !isAI ? engineConfig.userFont : annotationFont }}
                  >
                    {m.text}
                  </div>
                  
                  {isLast && isAI && !isProcessing && (
                     <div className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={handleRewrite}
                         className="w-6 h-6 flex items-center justify-center text-stone-300 hover:text-amber-500 bg-white rounded-full shadow-sm"
                         title="重写"
                       >
                         <i className="fa-solid fa-rotate-right text-xs"></i>
                       </button>
                     </div>
                  )}
                </div>
              </div>
             );
          })}
          
          {isProcessing && (
            <div className="flex justify-start items-start gap-3 animate-fadeIn">
              <Avatar avatar={persona.avatar} className="w-9 h-9 mt-1" />
              <div className="bg-white p-4 rounded-2xl rounded-tl-[2px] flex gap-1.5 border border-stone-200/50 shadow-sm items-center h-10">
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          )}
          
          {/* Bottom spacer for safe scroll */}
          <div className="h-2"></div>
        </div>

        {/* 4. INPUT AREA (Fixed) */}
        <div className="shrink-0 bg-[#f8f8f8] sm:bg-white border-t border-stone-200 p-3 safe-area-bottom z-20">
          <div className="flex items-end gap-2 bg-white sm:bg-stone-50 rounded-[24px] border border-stone-200 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-amber-500/10 focus-within:border-amber-400 transition-all">
            <textarea 
              rows={1}
              value={input}
              onChange={(e) => {
                  setInput(e.target.value);
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
              className="flex-1 bg-transparent border-none py-2 px-1 focus:outline-none text-[15px] resize-none max-h-[120px]"
              style={{ minHeight: '40px' }}
            />
            
            <div className="flex items-center gap-2 pb-1.5 pr-1">
              <button 
                onClick={() => handleSend(false)}
                disabled={!canRecordOnly}
                className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-full transition-colors"
                title="仅记录"
              >
                <i className="fa-solid fa-pen text-sm"></i>
              </button>

              <button 
                onClick={() => handleSend(true)}
                disabled={!canTriggerAI}
                className="w-8 h-8 flex items-center justify-center bg-amber-500 text-white rounded-full shadow-md hover:bg-amber-600 active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:bg-stone-300 transition-all"
                title="发送"
              >
                <i className="fa-solid fa-paper-plane text-xs translate-x-px translate-y-px"></i>
              </button>
            </div>
          </div>
        </div>

      </div>
      <style>{`
        .safe-area-top { padding-top: env(safe-area-inset-top); }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default AnnotationModal;
