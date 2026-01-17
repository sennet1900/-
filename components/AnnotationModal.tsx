
import React, { useState, useEffect, useRef } from 'react';
import { Annotation, Persona, EngineConfig } from '../types';
import { chatWithPersona, generateAIResponseToUserNote } from '../services/geminiService';

interface AnnotationActionModalProps {
  annotation: Annotation;
  persona: Persona;
  onClose: () => void;
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

const AnnotationModal: React.FC<AnnotationActionModalProps> = ({ annotation, persona, onClose, engineConfig, isOriginal = false }) => {
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const initialized = useRef(false);

  // Determine annotation font
  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      if (annotation.author === 'user') {
        setMessages([{ role: 'user', text: annotation.comment }]);
        setIsTyping(true);
        try {
          const aiReply = await generateAIResponseToUserNote(
            annotation.textSelection, 
            annotation.comment, 
            persona, 
            engineConfig,
            isOriginal
          );
          setMessages(prev => [...prev, { role: 'model', text: aiReply }]);
        } catch (err) {
          console.error(err);
          setMessages(prev => [...prev, { role: 'model', text: "I'm reflecting on your thought..." }]);
        } finally {
          setIsTyping(false);
        }
      } else {
        setMessages([{ role: 'model', text: annotation.comment }]);
      }
    };

    init();
  }, [annotation, persona, engineConfig, isOriginal]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const reply = await chatWithPersona(userMsg, annotation.textSelection, persona, messages, engineConfig, isOriginal);
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: "Forgive me, my thoughts are clouded right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

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
                  {isOriginal ? 'Close Connection' : 'Co-reading'}
                </div>
              </div>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                {isOriginal ? `A soul-to-soul talk about your creation` : 'Exploring the narrative together'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Selected Text */}
        <div className="bg-stone-50/50 p-4 border-b border-stone-100">
          <div className="text-stone-500 italic text-sm border-l-2 border-amber-300 pl-3">
            "{annotation.textSelection}"
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {m.role === 'model' && <Avatar avatar={persona.avatar} className="w-6 h-6 text-[10px] mb-1" />}
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
            </div>
          ))}
          {isTyping && (
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
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isOriginal ? `Tell ${persona.name} the story behind this heart-beat...` : `Continue our dialogue...`}
              className="w-full bg-white border border-stone-200 rounded-full py-3 px-5 pr-12 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="absolute right-2 p-2 bg-amber-600 text-white rounded-full hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <i className="fa-solid fa-paper-plane text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationModal;
