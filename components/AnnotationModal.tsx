
import React, { useState, useEffect, useRef } from 'react';
import { Annotation, Persona, EngineConfig } from '../types';
import { chatWithPersona, generateAIResponseToUserNote } from '../services/geminiService';

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
  const isImage = avatar.startsWith('data:');
  return (
    <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-white`}>
      {isImage ? (
        <img src={avatar} className="w-full h-full object-cover" alt="Avatar" />
      ) : (
        <span>{avatar}</span>
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
  const initialized = useRef(false);

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

  // Handle initialization of User-authored notes that don't have AI response yet
  // MOVED: This logic should ideally be handled by App.tsx upon creation, 
  // but if we open an old note that never got a reply, we might want to trigger it here?
  // For now, we assume App.tsx handles new creation flows.
  
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
  const lastMessageIsModel = messages.length > 0 && messages[messages.length - 1].role === 'model';
  
  const canTriggerAI = !isProcessing && (input.trim().length > 0 || lastMessageIsUser);
  const canRecordOnly = !isProcessing && input.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh] overflow-hidden border border-stone-100">
        {/* Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/30">
          <div className="flex items-center gap-3">
            <Avatar avatar={persona.avatar} className="w-12 h-12 text-3xl border border-stone-200" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-stone-800">{persona.name}</h4>
                <div className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <i className="fa-regular fa-heart"></i>
                  {isOriginal ? '心灵连接' : '共读中'}
                </div>
              </div>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                {isOriginal ? `关于你作品的灵魂对话` : '共同探索这段文字'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Selected Text (Truncated) */}
        <div className="bg-stone-50/50 p-4 border-b border-stone-100 shrink-0">
          <div 
            onClick={() => setIsTextExpanded(!isTextExpanded)}
            className={`text-stone-500 italic text-sm border-l-2 border-amber-300 pl-3 cursor-pointer transition-all ${isTextExpanded ? '' : 'line-clamp-2'}`}
            title={isTextExpanded ? "点击折叠" : "点击展开"}
          >
            "{annotation.textSelection}"
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {messages.map((m, i) => {
             const isLast = i === messages.length - 1;
             const isAI = m.role === 'model';
             return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2 group`}>
                {isAI && <Avatar avatar={persona.avatar} className="w-6 h-6 text-[10px] mb-1" />}
                
                <div className="relative">
                  <div 
                    className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                      m.role === 'user' 
                        ? 'bg-amber-600 text-white rounded-tr-none' 
                        : 'bg-stone-100 text-stone-800 rounded-tl-none border border-stone-200'
                    }`}
                    style={{ fontFamily: m.role === 'user' ? engineConfig.userFont : annotationFont }}
                  >
                    {m.text}
                  </div>
                  
                  {/* Rewrite Button (Only for last message if it is AI) */}
                  {isLast && isAI && !isProcessing && (
                     <button 
                       onClick={handleRewrite}
                       className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-stone-300 hover:text-amber-500 hover:rotate-180 transition-all rounded-full"
                       title="重写回复"
                     >
                       <i className="fa-solid fa-rotate-right"></i>
                     </button>
                  )}
                </div>

                {!isAI && <Avatar avatar={persona.userAvatar || '👤'} className="w-6 h-6 text-[10px] mb-1 border border-stone-100 bg-stone-50" />}
              </div>
             );
          })}
          
          {isProcessing && (
            <div className="flex justify-start items-end gap-2">
              <Avatar avatar={persona.avatar} className="w-6 h-6 text-[10px] mb-1" />
              <div className="bg-stone-100 p-3 rounded-2xl rounded-tl-none flex gap-1 border border-stone-200">
                <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 bg-stone-50 border-t border-stone-100">
          <div className="relative flex items-center">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend(true)}
              placeholder={isOriginal ? `告诉 ${persona.name} 这段文字背后的心跳...` : `继续我们的对话...`}
              className="w-full bg-white border border-stone-200 rounded-full py-3 px-5 pr-24 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {/* Send and Reply (Left Button) */}
              <button 
                onClick={() => handleSend(true)}
                disabled={!canTriggerAI}
                className="p-2 bg-amber-600 text-white rounded-full hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="发送并获取 AI 回复 (或让 AI 回复之前的内容)"
              >
                <i className="fa-solid fa-paper-plane text-xs"></i>
              </button>

              {/* Record Only (Right Button) */}
              <button 
                onClick={() => handleSend(false)}
                disabled={!canRecordOnly}
                className="p-2 bg-stone-200 text-stone-500 rounded-full hover:bg-stone-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="仅记录笔记 (不回复)"
              >
                <i className="fa-solid fa-check text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationModal;
