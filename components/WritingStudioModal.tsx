
import React, { useState, useEffect, useMemo } from 'react';
import { Persona, Book, WritingMetadata, Chapter } from '../types';

interface WritingStudioModalProps {
  activePersona: Persona;
  existingBook?: Book | null;
  onSave: (title: string, content: string, author: string, category: string, existingId?: string, writingMetadata?: WritingMetadata) => void;
  onClose: () => void;
}

const Avatar: React.FC<{ avatar: string; className?: string }> = ({ avatar, className = "w-10 h-10" }) => {
  const safeAvatar = avatar || '👤';
  const isImage = safeAvatar.startsWith('data:');
  return (
    <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shrink-0`}>
      {isImage ? (
        <img src={safeAvatar} className="w-full h-full object-cover" alt="Avatar" />
      ) : (
        <span>{safeAvatar}</span>
      )}
    </div>
  );
};

// Sub-components for better organization
const InitScreen: React.FC<{
  onStart: (title: string, author: string, category: string) => void;
  onClose: () => void;
}> = ({ onStart, onClose }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('Novel');

  return (
    <div className="flex flex-col h-full items-center justify-center p-8 bg-stone-50 animate-fadeIn">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-stone-200">
        <div className="text-center mb-8">
           <h2 className="text-2xl font-serif font-bold text-stone-900">开启新创作</h2>
           <p className="text-stone-400 text-sm mt-2">在水墨工坊开始你的旅程。</p>
        </div>
        <div className="space-y-6">
           <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">作品标题</label>
              <input 
                autoFocus
                type="text" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如: 寂静之海"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 font-serif text-lg"
              />
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">笔名</label>
              <input 
                type="text" 
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="你的笔名"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
              />
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">分类</label>
              <div className="flex flex-wrap gap-2">
                 {['小说', '同人', '随笔', '剧本'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${category === cat ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                    >
                      {cat}
                    </button>
                 ))}
              </div>
           </div>
           <div className="flex gap-4 pt-4">
              <button onClick={onClose} className="flex-1 py-3 text-stone-500 font-bold hover:bg-stone-100 rounded-xl transition-all">取消</button>
              <button 
                onClick={() => onStart(title, author, category)}
                disabled={!title.trim() || !author.trim()}
                className="flex-[2] py-3 bg-stone-900 text-white font-bold rounded-xl shadow-lg hover:bg-stone-800 disabled:opacity-50 transition-all"
              >
                开始写作
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

type EditorSection = 'chapter' | 'mainOutline' | 'volumeOutline' | 'inspirations' | 'characterSettings';

const WritingStudioModal: React.FC<WritingStudioModalProps> = ({ activePersona, existingBook, onSave, onClose }) => {
  // State 1: Metadata & Book Info
  const [bookInfo, setBookInfo] = useState({
    title: existingBook?.title || '',
    author: existingBook?.author || '',
    category: existingBook?.category || 'Novel'
  });

  const [metadata, setMetadata] = useState<WritingMetadata>({
    chapters: existingBook?.writingMetadata?.chapters || [],
    mainOutline: existingBook?.writingMetadata?.mainOutline || '',
    volumeOutline: existingBook?.writingMetadata?.volumeOutline || '',
    inspirations: existingBook?.writingMetadata?.inspirations || '',
    characterSettings: existingBook?.writingMetadata?.characterSettings || ''
  });

  // Init check
  useEffect(() => {
    if (existingBook && !existingBook.writingMetadata && existingBook.content && metadata.chapters.length === 0) {
       setMetadata(prev => ({
         ...prev,
         chapters: [{
           id: Date.now().toString(),
           title: 'Chapter 1',
           content: existingBook.content,
           lastModified: Date.now()
         }]
       }));
    }
  }, [existingBook]);

  // State 2: UI State
  const [isInit, setIsInit] = useState(!existingBook);
  const [activeTab, setActiveTab] = useState<'directory' | 'blueprints'>('directory');
  const [activeSection, setActiveSection] = useState<EditorSection>('chapter');
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  
  // Initialize selection
  useEffect(() => {
    if (!isInit && activeChapterId === null) {
       if (metadata.chapters.length > 0) {
         setActiveChapterId(metadata.chapters[0].id);
         setActiveSection('chapter');
       } else if (activeSection === 'chapter') {
         setActiveChapterId(null);
       }
    }
  }, [isInit, metadata.chapters]);

  // Derived state to control mobile view switching
  // We show the editor if we are in a blueprint section OR if a specific chapter is selected.
  const isEditorActive = useMemo(() => {
    return activeChapterId !== null || activeSection !== 'chapter';
  }, [activeChapterId, activeSection]);

  // Content Editing
  const currentContent = useMemo(() => {
    if (activeSection === 'chapter') {
      return metadata.chapters.find(c => c.id === activeChapterId)?.content || '';
    }
    return metadata[activeSection] as string;
  }, [activeSection, activeChapterId, metadata]);

  const wordCount = useMemo(() => {
    return currentContent.trim().split(/\s+/).filter(w => w.length > 0).length;
  }, [currentContent]);

  // --- Handlers ---

  const handleInitStart = (title: string, author: string, category: string) => {
    setBookInfo({ title, author, category });
    setIsInit(false);
    const firstChapter = {
      id: Date.now().toString(),
      title: '第一章',
      content: '',
      lastModified: Date.now()
    };
    setMetadata(prev => ({ ...prev, chapters: [firstChapter] }));
    setActiveChapterId(firstChapter.id);
  };

  const handleUpdateContent = (text: string) => {
    if (activeSection === 'chapter' && activeChapterId) {
      setMetadata(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => c.id === activeChapterId ? { ...c, content: text, lastModified: Date.now() } : c)
      }));
    } else if (activeSection !== 'chapter') {
      setMetadata(prev => ({
        ...prev,
        [activeSection]: text
      }));
    }
  };

  const handleAddChapter = () => {
    const newId = Date.now().toString();
    const count = metadata.chapters.length + 1;
    const newChapter: Chapter = {
      id: newId,
      title: `第 ${count} 章`,
      content: '',
      lastModified: Date.now()
    };
    setMetadata(prev => ({ ...prev, chapters: [...prev.chapters, newChapter] }));
    setActiveChapterId(newId);
    setActiveSection('chapter');
    setActiveTab('directory');
    setIsDeleteMode(false);
  };

  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("确定要永久删除此章节吗?")) {
       setMetadata(prev => {
         const newChapters = prev.chapters.filter(c => c.id !== id);
         return {
           ...prev,
           chapters: newChapters
         };
       });
       if (activeChapterId === id) setActiveChapterId(null);
    }
  };

  const handleRenameChapter = (id: string, newTitle: string) => {
    setMetadata(prev => ({
      ...prev,
      chapters: prev.chapters.map(c => c.id === id ? { ...c, title: newTitle } : c)
    }));
  };

  const handleSaveAll = () => {
    const compiledContent = metadata.chapters.map(c => `${c.title}\n\n${c.content}`).join('\n\n***\n\n');
    onSave(
      bookInfo.title,
      compiledContent,
      bookInfo.author,
      bookInfo.category,
      existingBook?.id,
      metadata
    );
  };

  // Helper
  const getChapterWordCount = (content: string) => content.trim().split(/\s+/).filter(w => w.length > 0).length;
  const formatTime = (ts: number) => new Date(ts).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // --- Render ---

  if (isInit) {
    return <InitScreen onStart={handleInitStart} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-fadeIn">
      {/* 1. Header */}
      <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b border-stone-100 flex items-center justify-between px-4 md:px-6 shrink-0 bg-white z-20">
        <div className="flex items-center gap-4 flex-1 overflow-hidden">
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900 transition-colors shrink-0">
             <i className="fa-solid fa-arrow-left text-lg"></i>
          </button>
          <div className="flex flex-col overflow-hidden">
             <div className="flex items-baseline gap-2">
                <h2 className="font-serif font-bold text-stone-900 truncate text-base">{bookInfo.title}</h2>
             </div>
             <span className="text-[10px] text-stone-400 font-medium truncate">{wordCount} 字</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
           {/* Cloud Sync Icon */}
           <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center text-stone-400">
             <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
           </div>
           
           <button 
             onClick={handleSaveAll}
             className="px-4 py-1.5 bg-stone-900 text-white rounded-lg font-bold text-xs hover:bg-stone-800 transition-all shadow-lg flex items-center gap-2"
           >
             完成/保存
           </button>
        </div>
      </header>

      {/* 2. Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <aside 
          className={`w-full md:w-80 flex flex-col border-r border-stone-100 bg-stone-50/50 shrink-0 md:relative absolute inset-0 z-30 md:z-auto transition-all ${isEditorActive ? 'hidden md:flex' : 'flex'}`}
        >
          {/* Tabs */}
          <div className="flex border-b border-stone-100 bg-white">
             <button 
               onClick={() => setActiveTab('directory')}
               className={`flex-1 py-3 text-xs font-bold transition-all ${activeTab === 'directory' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400'}`}
             >
                章节目录
             </button>
             <button 
               onClick={() => setActiveTab('blueprints')}
               className={`flex-1 py-3 text-xs font-bold transition-all ${activeTab === 'blueprints' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400'}`}
             >
                大纲
             </button>
          </div>

          {/* Toolbar (Only for Directory) */}
          {activeTab === 'directory' && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-stone-100 bg-stone-50/50">
               <button className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-900 transition-colors">
                 <i className="fa-solid fa-arrow-down-short-wide"></i>
               </button>
               <button 
                 onClick={() => setIsDeleteMode(!isDeleteMode)}
                 className={`w-8 h-8 flex items-center justify-center transition-colors rounded-lg ${isDeleteMode ? 'bg-red-100 text-red-600' : 'text-stone-400 hover:text-stone-900'}`}
               >
                 <i className="fa-solid fa-trash-can"></i>
               </button>
               <button 
                 onClick={handleAddChapter}
                 className="w-8 h-8 flex items-center justify-center bg-stone-900 text-white rounded-lg shadow-sm hover:bg-stone-700 transition-colors"
               >
                 <i className="fa-solid fa-plus"></i>
               </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
             {activeTab === 'directory' && (
               <div className="pb-4">
                 {metadata.chapters.map((chapter, idx) => (
                    <div 
                      key={chapter.id}
                      onClick={() => { 
                         if (!isDeleteMode) {
                           setActiveChapterId(chapter.id); 
                           setActiveSection('chapter'); 
                         }
                      }}
                      className={`relative px-4 py-3 cursor-pointer transition-all border-b border-stone-100 flex items-center justify-between ${activeSection === 'chapter' && activeChapterId === chapter.id ? 'bg-white border-l-4 border-l-stone-900' : 'hover:bg-white border-l-4 border-l-transparent'}`}
                    >
                       <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-stone-800 truncate mb-1">
                             {chapter.title}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-stone-400">
                             <span>{getChapterWordCount(chapter.content)}字</span>
                             <span>{formatTime(chapter.lastModified)}</span>
                          </div>
                       </div>
                       
                       {isDeleteMode && (
                         <button 
                           onMouseDown={(e) => e.stopPropagation()}
                           onClick={(e) => handleDeleteChapter(chapter.id, e)}
                           className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 rounded-full hover:bg-red-100 transition-colors shrink-0 ml-2"
                         >
                            <i className="fa-solid fa-minus"></i>
                         </button>
                       )}
                    </div>
                 ))}
                 
                 <div className="p-4">
                    <button 
                      onClick={handleAddChapter}
                      className="w-full py-3 flex items-center justify-center gap-2 text-stone-400 hover:text-stone-600 transition-colors border border-dashed border-stone-200 rounded-xl"
                    >
                       <i className="fa-solid fa-circle-plus"></i>
                       <span className="text-xs font-bold">新建章节</span>
                    </button>
                 </div>
               </div>
             )}

             {activeTab === 'blueprints' && (
               <div className="p-4 space-y-2">
                 {[
                   { id: 'mainOutline', label: '作品大纲', icon: 'fa-book' },
                   { id: 'volumeOutline', label: '分卷大纲', icon: 'fa-layer-group' },
                   { id: 'inspirations', label: '灵感记录', icon: 'fa-lightbulb' },
                   { id: 'characterSettings', label: '角色设定', icon: 'fa-users' },
                 ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setActiveSection(item.id as EditorSection); setActiveChapterId(null); }}
                      className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all border ${activeSection === item.id ? 'bg-white border-stone-200 shadow-sm' : 'bg-transparent border-transparent text-stone-500 hover:bg-white/50'}`}
                    >
                       <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${activeSection === item.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400'}`}>
                          <i className={`fa-solid ${item.icon}`}></i>
                       </div>
                       <span className="text-sm font-bold text-stone-800">{item.label}</span>
                    </button>
                 ))}
               </div>
             )}
          </div>

          <div className="p-4 border-t border-stone-100 bg-white md:bg-stone-50/50">
             <button 
                onClick={onClose}
                className="w-full py-3 text-stone-500 hover:text-stone-900 bg-white border border-stone-200 hover:border-stone-300 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
             >
                <i className="fa-solid fa-house"></i>
                <span className="font-bold text-xs">返回主页</span>
             </button>
          </div>
        </aside>

        {/* Editor Area (Hidden on mobile if directory is showing) */}
        <main className={`flex-1 bg-[#fcfbf9] relative flex flex-col ${!isEditorActive ? 'hidden md:flex' : 'flex'}`}>
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/handmade-paper.png')]"></div>
           
           {/* Section Header */}
           <div className="h-14 border-b border-stone-100/50 flex items-center px-6 shrink-0 bg-white/50 backdrop-blur-sm justify-between">
              {/* Mobile Back Button */}
              <button 
                onClick={() => { setActiveChapterId(null); setActiveSection('chapter'); }}
                className="md:hidden mr-4 w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 text-stone-500"
              >
                 <i className="fa-solid fa-chevron-left"></i>
              </button>

              <div className="flex-1">
                {activeSection === 'chapter' && activeChapterId ? (
                   <input 
                     type="text"
                     value={metadata.chapters.find(c => c.id === activeChapterId)?.title || ''}
                     onChange={(e) => handleRenameChapter(activeChapterId, e.target.value)}
                     className="bg-transparent font-bold text-stone-900 focus:outline-none focus:border-b border-stone-300 text-base w-full"
                     placeholder="章节标题"
                   />
                ) : (
                   <h3 className="font-bold text-stone-400 text-xs uppercase tracking-widest">
                     {activeSection === 'mainOutline' && '作品大纲'}
                     {activeSection === 'volumeOutline' && '分卷大纲'}
                     {activeSection === 'inspirations' && '灵感记录'}
                     {activeSection === 'characterSettings' && '角色设定'}
                   </h3>
                )}
              </div>
           </div>

           <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 relative">
              <textarea 
                 value={currentContent}
                 onChange={(e) => handleUpdateContent(e.target.value)}
                 placeholder={activeSection === 'chapter' ? "开始撰写章节..." : "在此草拟你的想法..."}
                 className="w-full h-full bg-transparent border-none focus:outline-none font-serif text-lg leading-relaxed text-stone-800 placeholder:text-stone-300 resize-none min-h-[60vh]"
              />
           </div>
           
           {/* Mobile Floating Action Button (Only for quick save or AI) */}
           <button 
              onClick={handleSaveAll}
              className="md:hidden fixed right-6 bottom-8 z-50 w-12 h-12 bg-stone-900 text-amber-500 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 border-2 border-stone-800"
           >
              <i className="fa-solid fa-pen-nib text-lg"></i>
           </button>
        </main>
      </div>
    </div>
  );
};

export default WritingStudioModal;
