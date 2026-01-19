
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Book, Annotation, EngineConfig } from '../types';

interface ReaderProps {
  book: Book;
  annotations: Annotation[];
  onAnnotate: (selection: string, start: number, end: number, intent?: 'ai' | 'user') => void;
  activeAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
  readingMode: 'vertical' | 'horizontal';
  onPageChange?: (pageContent: string, progress: number) => void;
  engineConfig: EngineConfig;
  onUpdateConfig: (config: EngineConfig) => void;
}

const PARAGRAPHS_PER_PAGE = 5; // Slightly increased for wider layout

const THEMES = {
  paper: { bg: '#FDFCF8', text: '#2D2926', name: '宣纸' },
  sepia: { bg: '#F4ECD8', text: '#5B4636', name: '古籍' },
  night: { bg: '#1C1C1E', text: '#D1D1D6', name: '静夜' },
  forest: { bg: '#E3EDCD', text: '#2E4C2E', name: '竹林' },
  custom: { bg: 'transparent', text: '#2D2926', name: '幻境' }
};

const Reader: React.FC<ReaderProps> = ({ 
  book, 
  annotations, 
  onAnnotate, 
  activeAnnotationId,
  onSelectAnnotation,
  readingMode,
  onPageChange,
  engineConfig,
  onUpdateConfig
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [showToolbarPanel, setShowToolbarPanel] = useState<'none' | 'notes' | 'stats' | 'theme' | 'font'>('none');
  const [tempSelection, setTempSelection] = useState<string | null>(null); // State for current text selection
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Split content into pages based on paragraphs
  const pages = useMemo(() => {
    if (!book.content) return [['(无内容)']];
    const paragraphs = book.content.split('\n').filter(p => p.trim() !== '');
    if (paragraphs.length === 0) return [['(无内容)']];
    
    if (readingMode === 'vertical') {
       return [paragraphs];
    }

    const result = [];
    for (let i = 0; i < paragraphs.length; i += PARAGRAPHS_PER_PAGE) {
      result.push(paragraphs.slice(i, i + PARAGRAPHS_PER_PAGE));
    }
    return result;
  }, [book.content, readingMode]);

  const progressPercent = useMemo(() => {
    if (pages.length === 0) return 0;
    return Math.round(((currentPage + 1) / pages.length) * 100);
  }, [currentPage, pages.length]);

  useEffect(() => {
    if (pages[currentPage]) {
      onPageChange?.(pages[currentPage].join('\n'), progressPercent);
    }
  }, [currentPage, pages, onPageChange, progressPercent]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, book.id]);

  useEffect(() => {
    setCurrentPage(0);
  }, [book.id, readingMode]);

  // Handle Text Selection (Mobile & Desktop Friendly)
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0) {
        setTempSelection(text);
      } else {
        // Delay clearing allows click events on floating buttons to register if the selection was cleared by the click itself.
        // We do check activeElement, but on mobile touch events can be tricky.
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'BUTTON' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
           setTempSelection(null);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleManualAnnotate = (intent?: 'ai' | 'user') => {
    if (tempSelection) {
      onAnnotate(tempSelection, 0, 0, intent);
      setTempSelection(null);
      // Clear selection logic if needed
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
    }
  };

  const nextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const renderParagraph = (text: string, paraIdx: number) => {
    const paraAnnotations = annotations.filter(anno => text.includes(anno.textSelection));
    if (paraAnnotations.length === 0) {
      return <p key={paraIdx} className="mb-8 leading-relaxed text-justify indent-8">{text}</p>;
    }
    
    let segments: { start: number; end: number; id: string; isAutonomous?: boolean }[] = [];
    paraAnnotations.forEach(anno => {
      let pos = text.indexOf(anno.textSelection);
      while (pos !== -1) {
        segments.push({ start: pos, end: pos + anno.textSelection.length, id: anno.id, isAutonomous: anno.isAutonomous });
        pos = text.indexOf(anno.textSelection, pos + 1);
      }
    });
    
    segments.sort((a, b) => a.start - b.start);
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    
    for (const seg of segments) {
      if (seg.start < lastIndex) continue;
      if (seg.start > lastIndex) result.push(text.substring(lastIndex, seg.start));
      const match = text.substring(seg.start, seg.end);
      const isActive = activeAnnotationId === seg.id;
      result.push(
        <span
          key={`${seg.id}-${seg.start}`}
          onClick={(e) => { e.stopPropagation(); onSelectAnnotation(seg.id); }}
          className={`border-b-2 border-dashed cursor-pointer transition-all duration-200 ${
            isActive ? 'border-amber-500 bg-amber-500/10 font-medium' : seg.isAutonomous ? 'border-purple-300 bg-purple-500/5 hover:border-purple-500' : 'border-stone-400 hover:border-amber-500 hover:bg-amber-50'
          }`}
        >
          {match}
        </span>
      );
      lastIndex = seg.end;
    }
    if (lastIndex < text.length) result.push(text.substring(lastIndex));
    return <p key={paraIdx} className="mb-8 leading-relaxed text-justify indent-8">{result}</p>;
  };

  const theme = THEMES[engineConfig.theme] || THEMES.paper;
  const currentFont = engineConfig.customFontName || engineConfig.aiFont;

  return (
    <div 
      className="w-full h-full relative select-text overflow-hidden transition-colors duration-500"
      style={{ 
        backgroundColor: engineConfig.theme === 'custom' ? 'transparent' : theme.bg, 
        color: theme.text,
        fontFamily: currentFont
      }}
    >
      {/* Custom Background Layer */}
      {engineConfig.theme === 'custom' && engineConfig.customBgImage && (
        <div 
          className="absolute inset-0 z-0 pointer-events-none transition-all duration-700"
          style={{ 
            backgroundImage: `url(${engineConfig.customBgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: engineConfig.bgOpacity,
            filter: engineConfig.useBlur ? 'blur(10px) scale(1.1)' : 'none'
          }}
        />
      )}

      {/* Main Content Area */}
      <div 
        className="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center custom-reader-scroll relative z-10 scroll-smooth" 
        ref={scrollContainerRef}
      >
        <div 
          key={`${book.id}-page-${currentPage}`} 
          className={`max-w-3xl w-full px-6 md:px-16 py-12 md:py-20 transition-all duration-300 transform ${readingMode === 'horizontal' ? 'animate-fadeInRight' : ''}`}
        >
          {currentPage === 0 && (
            <div className="mb-12 border-b border-stone-200/20 pb-8">
              <h1 className="text-3xl md:text-5xl font-serif font-bold mb-4 leading-tight">{book.title}</h1>
              {book.author && <p className="opacity-60 italic text-lg">By {book.author}</p>}
            </div>
          )}
          
          <div 
            className="book-content font-serif selection:bg-amber-500/30 leading-loose"
            style={{ fontSize: `${engineConfig.fontSize}px` }}
          >
            {pages[currentPage]?.map((para, i) => renderParagraph(para, i))}
          </div>

          {currentPage === pages.length - 1 && (
            <div className="h-32 flex flex-col items-center justify-center opacity-20 mt-12 pt-8">
              <div className="text-sm italic">全书完</div>
              <div className="mt-4 text-2xl">❦</div>
            </div>
          )}
          
          {/* Spacer for bottom toolbar */}
          <div className="h-32" />
        </div>

        {/* Floating Action Buttons (Appear when text is selected) */}
        {tempSelection && (
           <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 animate-bounce-in">
              <button 
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.stopPropagation()} 
                onClick={() => handleManualAnnotate('user')}
                className="flex items-center gap-2 bg-white text-stone-900 px-6 py-3 rounded-full shadow-xl font-bold text-sm border border-stone-200 active:scale-95 transition-all hover:bg-stone-50"
              >
                <i className="fa-solid fa-pen-nib text-amber-600"></i>
                <span>写想法</span>
              </button>
              <button 
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={() => handleManualAnnotate('ai')}
                className="flex items-center gap-2 bg-stone-900 text-amber-500 px-6 py-3 rounded-full shadow-xl font-bold text-sm border border-stone-700 active:scale-95 transition-all hover:scale-105"
              >
                <i className="fa-solid fa-sparkles animate-pulse"></i>
                <span>AI 批注</span>
              </button>
           </div>
        )}

        {/* Toolbar Panel */}
        {showToolbarPanel !== 'none' && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-white/95 backdrop-blur-xl border border-stone-200 rounded-3xl shadow-2xl z-[60] overflow-hidden animate-slideUp">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-100">
                <h4 className="font-bold text-stone-900 flex items-center gap-2">
                  {showToolbarPanel === 'theme' && <><i className="fa-solid fa-palette"></i> 环境氛围</>}
                  {showToolbarPanel === 'font' && <><i className="fa-solid fa-font"></i> 字体字格</>}
                  {showToolbarPanel === 'stats' && <><i className="fa-solid fa-chart-pie"></i> 阅读进度</>}
                  {showToolbarPanel === 'notes' && <><i className="fa-solid fa-feather-pointed"></i> 阅历 (批注)</>}
                </h4>
                <button onClick={() => setShowToolbarPanel('none')} className="text-stone-400 hover:text-stone-900 transition-colors">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                
                {/* Notes (Annotations List) */}
                {showToolbarPanel === 'notes' && (
                  <div className="space-y-4 py-2">
                    <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                       All Annotations ({annotations.length})
                    </div>
                    {annotations.length === 0 ? (
                      <div className="text-center text-stone-400 py-8 italic text-xs border-2 border-dashed border-stone-100 rounded-xl">
                        No thoughts recorded yet.<br/>Select text to begin.
                      </div>
                    ) : (
                      annotations.map(anno => (
                        <div 
                          key={anno.id}
                          onClick={() => {
                             onSelectAnnotation(anno.id);
                             // Auto-jump logic: find the page that contains this text selection
                             const pageIndex = pages.findIndex(p => p.join('\n').includes(anno.textSelection));
                             if (pageIndex !== -1 && pageIndex !== currentPage) {
                               setCurrentPage(pageIndex);
                             }
                          }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${activeAnnotationId === anno.id ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-stone-50 border-stone-100 hover:border-stone-200'}`}
                        >
                           <div className="text-xs font-serif font-bold text-stone-800 mb-1 line-clamp-2 border-l-2 border-stone-300 pl-2">
                            "{anno.textSelection}"
                          </div>
                          <div className="flex items-center justify-between mt-2">
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${anno.author === 'ai' ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-600'}`}>
                                   {anno.author === 'ai' ? 'AI' : 'You'}
                                </span>
                                <span className="text-[10px] text-stone-400">{new Date(anno.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                             </div>
                             {anno.comment && <i className="fa-solid fa-comment-dots text-stone-300 text-xs"></i>}
                          </div>
                          {anno.comment && (
                             <div className="mt-2 text-[11px] text-stone-600 line-clamp-2 leading-relaxed">
                                {anno.comment}
                             </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {showToolbarPanel === 'stats' && (
                  <div className="space-y-6 py-2">
                    <div className="flex items-center justify-between px-2">
                       <div className="flex flex-col">
                         <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Progress</span>
                         <span className="text-3xl font-serif font-bold text-stone-800">{progressPercent}%</span>
                       </div>
                       <div className="text-right">
                         <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Page</span>
                         <div className="text-xl font-serif font-bold text-amber-600">{currentPage + 1} <span className="text-stone-300 text-sm">/ {pages.length}</span></div>
                       </div>
                    </div>
                    
                    {readingMode === 'horizontal' && (
                      <div className="space-y-3">
                        <input 
                          type="range" 
                          min="0" 
                          max={Math.max(0, pages.length - 1)} 
                          value={currentPage} 
                          onChange={(e) => setCurrentPage(parseInt(e.target.value))}
                          className="w-full accent-amber-500 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                )}

                {showToolbarPanel === 'theme' && (
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-5 gap-3">
                      {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map(k => (
                        <button 
                          key={k} 
                          onClick={() => onUpdateConfig({ ...engineConfig, theme: k })}
                          className={`group flex flex-col items-center gap-2`}
                        >
                          <div 
                            className={`w-10 h-10 rounded-full border-2 transition-all ${engineConfig.theme === k ? 'border-amber-500 scale-110 shadow-lg' : 'border-stone-100 group-hover:border-stone-300'}`}
                            style={{ 
                              backgroundColor: THEMES[k].bg,
                              backgroundImage: k === 'custom' && engineConfig.customBgImage ? `url(${engineConfig.customBgImage})` : 'none',
                              backgroundSize: 'cover'
                            }}
                          />
                          <span className="text-[10px] font-bold text-stone-500">{THEMES[k].name}</span>
                        </button>
                      ))}
                    </div>
                    {engineConfig.theme === 'custom' && (
                      <div className="p-4 bg-stone-50 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                           <span className="text-[10px] font-bold text-stone-400 uppercase">氛围浓度</span>
                           <input 
                            type="range" min="0" max="1" step="0.1" 
                            value={engineConfig.bgOpacity}
                            onChange={(e) => onUpdateConfig({...engineConfig, bgOpacity: parseFloat(e.target.value)})}
                            className="w-32 accent-amber-500"
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-[10px] font-bold text-stone-400 uppercase">幻境迷雾 (模糊)</span>
                           <button 
                            onClick={() => onUpdateConfig({...engineConfig, useBlur: !engineConfig.useBlur})}
                            className={`w-8 h-4 rounded-full transition-colors ${engineConfig.useBlur ? 'bg-amber-500' : 'bg-stone-200'}`}
                           />
                        </div>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
                       <span className="text-xs font-bold text-stone-600">Reading Mode</span>
                       <div className="flex bg-stone-100 p-1 rounded-xl">
                          <button 
                            onClick={() => onUpdateConfig({...engineConfig, readingMode: 'horizontal'})}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${engineConfig.readingMode === 'horizontal' ? 'bg-white shadow text-amber-600' : 'text-stone-400'}`}
                          >
                             <i className="fa-solid fa-book-open mr-1"></i> Paged
                          </button>
                          <button 
                            onClick={() => onUpdateConfig({...engineConfig, readingMode: 'vertical'})}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${engineConfig.readingMode === 'vertical' ? 'bg-white shadow text-amber-600' : 'text-stone-400'}`}
                          >
                             <i className="fa-solid fa-scroll mr-1"></i> Scroll
                          </button>
                       </div>
                    </div>
                  </div>
                )}

                {showToolbarPanel === 'font' && (
                  <div className="space-y-6 py-2">
                    <div className="space-y-3">
                       <div className="flex items-center justify-between text-xs font-bold text-stone-400 uppercase">字号调节: {engineConfig.fontSize}px</div>
                       <input 
                         type="range" min="16" max="32" step="1" 
                         value={engineConfig.fontSize} 
                         onChange={(e) => onUpdateConfig({...engineConfig, fontSize: parseInt(e.target.value)})}
                         className="w-full accent-amber-500"
                       />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toolbar Buttons */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-white/80 backdrop-blur-xl border border-stone-200/50 rounded-2xl shadow-xl z-50">
           {[
             { id: 'notes', icon: 'fa-feather-pointed', label: '阅历' },
             { id: 'stats', icon: 'fa-chart-pie', label: '进度' }, 
             { id: 'theme', icon: 'fa-palette', label: '氛围' },
             { id: 'font', icon: 'fa-font', label: '字格' }
           ].map(tool => (
             <button 
               key={tool.id}
               onClick={() => setShowToolbarPanel(prev => prev === tool.id ? 'none' : (tool.id as any))}
               className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${showToolbarPanel === tool.id ? 'bg-amber-500 text-white' : 'text-stone-400 hover:text-stone-900 hover:bg-stone-100'}`}
             >
               <i className={`fa-solid ${tool.icon} text-lg`}></i>
               <span className="text-[8px] font-bold mt-0.5">{tool.label}</span>
             </button>
           ))}
        </div>
      </div>

      {/* Navigation Buttons (Absolute, minimal handles) */}
      {readingMode === 'horizontal' && (
        <>
          <button 
            onClick={prevPage} 
            disabled={currentPage === 0}
            className={`absolute z-20 flex items-center justify-center text-stone-300 hover:text-amber-600 disabled:opacity-0 transition-all active:scale-95 hover:bg-stone-500/10
              left-0 top-1/2 -translate-y-1/2 h-24 w-10 md:w-16 rounded-r-xl`}
            aria-label="Previous Page"
          >
            <i className="fa-solid fa-chevron-left text-lg"></i>
          </button>

          <button 
            onClick={nextPage} 
            disabled={currentPage === pages.length - 1} 
            className={`absolute z-20 flex items-center justify-center text-stone-300 hover:text-amber-600 disabled:opacity-0 transition-all active:scale-95 hover:bg-stone-500/10
              right-0 top-1/2 -translate-y-1/2 h-24 w-10 md:w-16 rounded-l-xl`}
            aria-label="Next Page"
          >
            <i className="fa-solid fa-chevron-right text-lg"></i>
          </button>
        </>
      )}
    </div>
  );
};

export default Reader;
