
import React, { useState, useEffect } from 'react';
import { Persona, Book } from '../types';

interface WritingStudioModalProps {
  activePersona: Persona;
  existingBook?: Book | null;
  onSave: (title: string, content: string, author: string, category: string, existingId?: string) => void;
  onClose: () => void;
}

const Avatar: React.FC<{ avatar: string; className?: string }> = ({ avatar, className = "w-10 h-10" }) => {
  const isImage = avatar.startsWith('data:');
  return (
    <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shrink-0`}>
      {isImage ? (
        <img src={avatar} className="w-full h-full object-cover" alt="Avatar" />
      ) : (
        <span>{avatar}</span>
      )}
    </div>
  );
};

const WritingStudioModal: React.FC<WritingStudioModalProps> = ({ activePersona, existingBook, onSave, onClose }) => {
  const [title, setTitle] = useState(existingBook?.title || '');
  const [content, setContent] = useState(existingBook?.content || '');
  const [author, setAuthor] = useState(existingBook?.author || 'SoulReader Author');
  const [category, setCategory] = useState(existingBook?.category || 'Original Draft');
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    const words = content.trim().split(/\s+/).filter(w => w.length > 0).length;
    setWordCount(words);
  }, [content]);

  const handlePublish = () => {
    if (title.trim() && content.trim()) {
      onSave(title, content, author, category, existingBook?.id);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-fadeIn">
      {/* Writing Header */}
      <header className="h-16 md:h-20 border-b border-stone-100 flex items-center justify-between px-4 md:px-12 shrink-0 gap-4">
        <div className="flex items-center gap-4 md:gap-6 flex-1 overflow-hidden">
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors shrink-0">
             <i className="fa-solid fa-arrow-left text-lg"></i>
          </button>
          <div className="h-6 w-px bg-stone-200 shrink-0"></div>
          <div className="flex flex-col flex-1 min-w-0">
            <input 
              type="text" 
              placeholder="Title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg md:text-xl font-serif font-bold text-stone-900 bg-transparent border-none focus:outline-none placeholder:text-stone-200 w-full truncate"
            />
            <div className="flex gap-4 text-[10px] md:text-xs">
                <input 
                    type="text" 
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="font-bold text-stone-400 bg-transparent border-none focus:outline-none uppercase tracking-widest max-w-[100px] truncate"
                />
                <span className="text-stone-300 hidden sm:inline">|</span>
                <span className="font-bold text-amber-600 uppercase tracking-widest hidden sm:inline">{wordCount} Words</span>
            </div>
          </div>
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-4">
           <div className="flex items-center gap-3 mr-6 bg-stone-50 px-4 py-2 rounded-2xl border border-stone-100">
              <Avatar avatar={activePersona.avatar} className="w-10 h-10 text-2xl" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-stone-400 uppercase">First Reader: {activePersona.name}</span>
                <span className="text-xs font-serif text-stone-600 italic">"I'm waiting to be moved by your words."</span>
              </div>
           </div>
           <button 
             onClick={handlePublish}
             disabled={!title.trim() || !content.trim()}
             className="px-8 py-3 bg-stone-900 text-white rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all disabled:opacity-20 shadow-xl flex items-center gap-2"
           >
             <i className="fa-solid fa-sparkles"></i>
             {existingBook ? 'Sync & Co-read' : 'Finish & Start Co-reading'}
           </button>
        </div>
      </header>

      {/* Editor Area */}
      <main className="flex-1 overflow-y-auto bg-[#fcfbf9] relative flex justify-center py-8 md:py-20">
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/handmade-paper.png')]"></div>
         
         <div className="max-w-3xl w-full px-6 md:px-12 pb-32 md:pb-24">
            <textarea 
               autoFocus
               value={content}
               onChange={(e) => setContent(e.target.value)}
               placeholder="Write without fear. Your first reader is ready..."
               className="w-full h-full bg-transparent border-none focus:outline-none font-serif text-lg md:text-2xl leading-relaxed text-stone-800 placeholder:text-stone-200 resize-none min-h-[60vh] md:min-h-[500px]"
            />
         </div>

         {/* Mobile Floating Action Button (Replaces the Anticipation Box) */}
         <button 
            onClick={handlePublish}
            disabled={!title.trim() || !content.trim()}
            className="md:hidden fixed right-6 bottom-16 z-50 px-6 py-4 bg-stone-900 text-white rounded-full shadow-2xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95 animate-slideUp border-2 border-stone-800/20 backdrop-blur-sm"
         >
            <i className="fa-solid fa-sparkles text-amber-500"></i>
            <span>{existingBook ? 'Sync' : 'Finish'}</span>
         </button>
      </main>

      <footer className="h-10 border-t border-stone-50 bg-white flex items-center justify-center px-4 md:px-12 text-[8px] md:text-[9px] text-stone-300 font-bold uppercase tracking-widest shrink-0">
         Inking Studio • {existingBook ? 'Editing Mode' : 'Creation Mode'}
      </footer>
    </div>
  );
};

export default WritingStudioModal;
