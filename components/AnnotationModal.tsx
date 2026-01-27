
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
  
  // Visual Viewport State
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [viewportTop, setViewportTop] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  // --- 1. CORE LAYOUT ENGINE (Visual Viewport API) ---
  useEffect(() => {
    // Handler to force the container to match the ACTUAL visible screen size (excluding keyboard)
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setViewportTop(window.visualViewport.offsetTop);
        
        // When keyboard opens/resizes, scroll to bottom to keep input visible
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } else {
        // Fallback for very old browsers
        setViewportHeight(window.innerHeight);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
      handleResize(); // Init
    } else {
      window.addEventListener('resize', handleResize);
    }

    // Lock Body Scroll
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
      // Unlock Body Scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  // --- 2. DATA SYNC ---
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

  // --- 3. AUTO SCROLL ---
  useLayoutEffect(() => {
    if (scrollRef.current) {
       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing, viewportHeight]); // Trigger on height change too

  const handleSend = async (triggerAI: boolean) => {
    if (isProcessing) return;
    if (!input.trim() && !triggerAI) return;

    let nextHistory = [...messages];
    if (input.trim()) {
      const userMsg = input;
      setInput('');
      // Reset height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

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
        if (inputRef.current) inputRef.current.style.height = 'auto';
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
    <div 
      className="fixed inset-0 z-[100] bg-stone-900/50 sm:backdrop-blur-sm sm:flex sm:items-center sm:justify-center"
      style={{
         // On Mobile: these are ignored because the inner container is fixed
         // On Desktop: this creates the overlay
      }}
    >
      {/* Desktop Click-to-close overlay */}
      <div className="hidden sm:block absolute inset-0" onClick={onClose}></div>

      {/* 
         THE MAIN CONTAINER 
         Mobile: Strictly controlled by JS height/top to match VisualViewport.
         Desktop: Standard centered modal.
      */}
      <div 
        className="fixed sm:relative bg-[#ededed] w-full sm:w-[450px] sm:h-[800px] sm:max-h-[85vh] sm:rounded-2xl sm:shadow-2xl flex flex-col overflow-hidden"
        style={{
          // MOBILE ONLY STYLES (overridden by sm: styles above)
          height: window.innerWidth < 640 ? `${viewportHeight}px` : undefined,
          top: window.innerWidth < 640 ? `${viewportTop}px` : undefined,
          left: 0,
        }}
      >
        
        {/* === HEADER (Fixed Height 56px) === */}
        <div className="h-14 shrink-0 bg-[#ededed] border-b border-stone-200/50 flex items-center justify-between px-4 relative z-20 shadow-sm">
           <button onClick={onClose} className="w-10 h-10 flex items-center justify-center -ml-2 text-stone-600">
             <i className="fa-solid fa-chevron-down text-lg"></i>
           </button>
           <div className="font-bold text-stone-900">{persona.name}</div>
           <button className="w-10 h-10 flex items-center justify-center text-stone-600">
             <i className="fa-solid fa-ellipsis"></i>
           </button>
        </div>

        {/* === SCROLL AREA (Flex Grow) === */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* 
            QUOTE BLOCK - MOVED INSIDE SCROLL AREA 
            This ensures it scrolls away when typing!
          */}
          <div className="flex justify-center mb-6">
             <div className="bg-stone-200/50 text-stone-500 text-xs px-4 py-2 rounded-lg max-w-[85%] text-center italic border border-stone-300/30">
                引用: "{annotation.textSelection}"
             </div>
          </div>

          {messages.map((m, i) => {
             const isAI = m.role === 'model';
             const isLast = i === messages.length - 1;
             return (
              <div key={i} className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'} items-start gap-2`}>
                {isAI && <Avatar avatar={persona.avatar} className="w-9 h-9 mt-0.5 rounded-lg" />}
                
                <div className={`relative max-w-[80%] min-w-[20px] px-3 py-2.5 text-[15px] leading-relaxed break-words shadow-sm
                  ${isAI 
                    ? 'bg-white text-stone-800 rounded-lg rounded-tl-none border border-stone-100' 
                    : 'bg-[#95ec69] text-stone-900 rounded-lg rounded-tr-none border border-[#85d65c]'
                  }`}
                  style={{ fontFamily: !isAI ? engineConfig.userFont : annotationFont }}
                >
                  {m.text}
                </div>

                {isLast && isAI && !isProcessing && (
                  <button onClick={handleRewrite} className="self-center text-stone-300 hover:text-amber-500 p-1">
                    <i className="fa-solid fa-rotate-right text-xs"></i>
                  </button>
                )}
              </div>
             );
          })}

          {isProcessing && (
             <div className="flex w-full justify-start items-start gap-2">
               <Avatar avatar={persona.avatar} className="w-9 h-9 mt-0.5 rounded-lg" />
               <div className="bg-white px-4 py-3 rounded-lg rounded-tl-none border border-stone-100 flex items-center gap-1">
                 <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce"></div>
                 <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                 <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
               </div>
             </div>
          )}
          
          {/* Spacer for comfortable bottom viewing */}
          <div className="h-2"></div>
        </div>

        {/* === INPUT AREA (Fixed Bottom relative to flex container) === */}
        <div className="shrink-0 bg-[#f7f7f7] border-t border-stone-200 px-4 py-3 flex items-end gap-3 z-20">
           {/* Action Button (Left) */}
           <button 
             onClick={() => handleSend(false)} 
             className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors mb-0.5 shrink-0 ${canRecordOnly ? 'bg-stone-200 text-stone-600' : 'text-stone-400'}`}
             disabled={!canRecordOnly}
           >
             <i className="fa-solid fa-pen-nib text-sm"></i>
           </button>

           <div className="flex-1 bg-white rounded-lg px-3 py-2 border border-stone-200 focus-within:bg-white transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(true);
                    }
                }}
                rows={1}
                placeholder={isOriginal ? `告诉 ${persona.name} ...` : "发送消息..."}
                className="w-full bg-transparent border-none outline-none text-[16px] resize-none max-h-[100px] py-0.5 block"
                style={{ height: 'auto', minHeight: '24px' }}
              />
           </div>

           {/* Send Button (Right) */}
           <div className="shrink-0 mb-0.5">
             {input.trim() || isProcessing ? (
                <button 
                  onClick={() => handleSend(true)}
                  disabled={!canTriggerAI}
                  className={`px-3 h-8 flex items-center justify-center rounded-md text-white font-bold text-sm transition-all ${canTriggerAI ? 'bg-[#07c160] active:bg-[#06ad56]' : 'bg-stone-300'}`}
                >
                  发送
                </button>
             ) : (
                <button className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-400 text-stone-600">
                   <i className="fa-solid fa-plus"></i>
                </button>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default AnnotationModal;
