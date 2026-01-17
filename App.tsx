
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Book, Annotation, Persona, AppState, EngineConfig } from './types';
import { DEFAULT_PERSONAS } from './constants';
import { generateAIAnnotation, summarizeTopic, autonomousScan } from './services/geminiService';
import Reader from './components/Reader';
import Sidebar from './components/Sidebar';
import AnnotationModal from './components/AnnotationModal';
import PersonaModal from './components/PersonaModal';
import SettingsModal from './components/SettingsModal';
import AnnotationActionModal from './components/AnnotationActionModal';
import LibraryView from './components/LibraryView';
import BookEditModal from './components/BookEditModal';
import ReadingReportModal from './components/ReadingReportModal';
import WritingStudioModal from './components/WritingStudioModal';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem('sr_library');
    return saved ? JSON.parse(saved) : [];
  });

  const [customPersonas, setCustomPersonas] = useState<Persona[]>(() => {
    const saved = localStorage.getItem('sr_custom_personas');
    return saved ? JSON.parse(saved) : [];
  });
  
  const allPersonas = useMemo(() => [...DEFAULT_PERSONAS, ...customPersonas], [customPersonas]);
  const [persona, setPersona] = useState<Persona>(allPersonas[0]);
  
  const [engineConfig, setEngineConfig] = useState<EngineConfig>(() => {
    const saved = localStorage.getItem('sr_engine_config');
    return saved ? JSON.parse(saved) : {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: '',
      model: 'gemini-3-flash-preview',
      temperature: 0.7,
      useThinking: true,
      aiFont: 'Crimson Pro',
      userFont: 'Inter',
      readingMode: 'horizontal',
      autonomousReading: false,
      autoAnnotationCount: 2, // Default to 2
      fontSize: 20,
      theme: 'paper',
      bgOpacity: 0.5,
      useBlur: true
    };
  });

  // Global injection of custom fonts (Book Body & Annotations)
  useEffect(() => {
    const styleId = 'custom-fonts-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    let css = '';
    
    // 1. Book Content Font
    if (engineConfig.customFontName && engineConfig.customFontData) {
      css += `
        @font-face {
          font-family: '${engineConfig.customFontName}';
          src: url(${engineConfig.customFontData});
        }
      `;
    }

    // 2. Annotation/Note Font
    if (engineConfig.customNoteFontName && engineConfig.customNoteFontData) {
      css += `
        @font-face {
          font-family: '${engineConfig.customNoteFontName}';
          src: url(${engineConfig.customNoteFontData});
        }
      `;
    }

    styleEl.innerHTML = css;
  }, [engineConfig.customFontName, engineConfig.customFontData, engineConfig.customNoteFontName, engineConfig.customNoteFontData]);

  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    const saved = localStorage.getItem('sr_annotations');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBookEditModalOpen, setIsBookEditModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isWritingStudioOpen, setIsWritingStudioOpen] = useState(false);
  
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [writingStudioBook, setWritingStudioBook] = useState<Book | null>(null);
  
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const lastScannedPageRef = useRef<string | null>(null);

  const activeBook = useMemo(() => library.find(b => b.id === activeBookId) || null, [library, activeBookId]);
  const bookAnnotations = useMemo(() => annotations.filter(a => a.bookId === activeBookId).sort((a,b) => b.timestamp - a.timestamp), [annotations, activeBookId]);

  useEffect(() => {
    if (appState === 'reading' && activeBookId) {
      const interval = setInterval(() => {
        setLibrary(prev => prev.map(b => 
          b.id === activeBookId ? { ...b, timeSpent: (b.timeSpent || 0) + 1 } : b
        ));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [appState, activeBookId]);

  useEffect(() => {
    localStorage.setItem('sr_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    localStorage.setItem('sr_annotations', JSON.stringify(annotations));
  }, [annotations]);

  useEffect(() => {
    localStorage.setItem('sr_custom_personas', JSON.stringify(customPersonas));
  }, [customPersonas]);

  useEffect(() => {
    localStorage.setItem('sr_engine_config', JSON.stringify(engineConfig));
  }, [engineConfig]);

  const handleImportBook = (title: string, content: string, author?: string) => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899'];
    const newBook: Book = {
      id: Date.now().toString(),
      title,
      content,
      author: author || 'Unknown Author',
      category: 'Uncategorized',
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      addedAt: Date.now(),
      timeSpent: 0,
      isOriginal: false
    };
    setLibrary(prev => [newBook, ...prev]);
    setActiveBookId(newBook.id);
    setAppState('reading');
  };

  const handleSaveCreatedBook = async (title: string, content: string, author: string, category: string, existingId?: string) => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899'];
    const newId = existingId || Date.now().toString();
    
    if (existingId) {
      setLibrary(prev => prev.map(b => b.id === existingId ? { ...b, title, content, author, category } : b));
    } else {
      const newBook: Book = {
        id: newId,
        title,
        content,
        author,
        category,
        coverColor: colors[Math.floor(Math.random() * colors.length)],
        addedAt: Date.now(),
        timeSpent: 0,
        isOriginal: true
      };
      setLibrary(prev => [newBook, ...prev]);
    }
    
    setIsWritingStudioOpen(false);
    setActiveBookId(newId);
    setAppState('reading');
    
    setTimeout(async () => {
      try {
        const firstPara = content.split('\n')[0] || content;
        const results = await autonomousScan(firstPara, persona, engineConfig, true);
        if (results && results.length > 0) {
          const newAnnos: Annotation[] = results.map((r, i) => ({
            id: (Date.now() + i).toString(),
            bookId: newId,
            textSelection: r.textSelection,
            comment: r.comment,
            author: 'ai',
            topic: r.topic,
            isAutonomous: true,
            timestamp: Date.now(),
            personaId: persona.id,
            position: { startOffset: 0, endOffset: 0 }
          }));
          setAnnotations(prev => [...newAnnos, ...prev]);
        }
      } catch (e) {
        console.error("Initial scan for user book failed", e);
      }
    }, 1500);
  };

  const handlePageChange = useCallback(async (content: string, p: number) => {
    setProgress(p);
    if (!engineConfig.autonomousReading || !activeBookId || isAutoScanning || lastScannedPageRef.current === content) return;
    
    const existingSelections = bookAnnotations.map(a => a.textSelection);
    setIsAutoScanning(true);
    lastScannedPageRef.current = content;

    try {
      const results = await autonomousScan(content, persona, engineConfig, activeBook?.isOriginal);
      
      const newAnnos: Annotation[] = [];
      if (results && results.length > 0) {
        results.forEach((r, idx) => {
          if (!existingSelections.includes(r.textSelection)) {
             newAnnos.push({
                id: (Date.now() + idx).toString(),
                bookId: activeBookId,
                textSelection: r.textSelection,
                comment: r.comment,
                author: 'ai',
                topic: r.topic,
                isAutonomous: true,
                timestamp: Date.now(),
                personaId: persona.id,
                position: { startOffset: 0, endOffset: 0 }
             });
          }
        });
      }

      if (newAnnos.length > 0) {
         setAnnotations(prev => [...newAnnos, ...prev]);
      }
    } catch (err) {
      console.error("Autonomous scan failed:", err);
    } finally {
      setIsAutoScanning(false);
    }
  }, [engineConfig.autonomousReading, engineConfig.model, engineConfig.autoAnnotationCount, activeBookId, persona, isAutoScanning, bookAnnotations, activeBook?.isOriginal]);

  const handleDeleteBook = (id: string) => {
    setLibrary(prev => prev.filter(b => b.id !== id));
    setAnnotations(prev => prev.filter(a => a.bookId !== id));
    if (activeBookId === id) {
      setActiveBookId(null);
      setAppState('library');
    }
  };

  const handleUpdateBook = (updatedBook: Book) => {
    setLibrary(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
  };

  const handleSaveReview = (rating: number, review: string, aiResponse?: string, aiLongReview?: string) => {
    if (!activeBookId) return;
    setLibrary(prev => prev.map(b => 
      b.id === activeBookId ? { ...b, rating, userReview: review, aiReview: aiLongReview } : b
    ));
  };

  const handleAnnotateSelection = useCallback((selection: string) => {
    setPendingSelection(selection);
  }, []);

  const handleAIAnnotate = async () => {
    if (!pendingSelection || !activeBook || isProcessing) return;
    const selection = pendingSelection;
    setPendingSelection(null);
    setIsProcessing(true);

    try {
      const tempId = Date.now().toString();
      const comment = await generateAIAnnotation(selection, activeBook.content, persona, engineConfig, activeBook.isOriginal);
      const topic = await summarizeTopic(selection, comment, engineConfig);
      
      const newAnno: Annotation = {
        id: tempId,
        bookId: activeBook.id,
        textSelection: selection,
        comment,
        author: 'ai',
        topic,
        timestamp: Date.now(),
        personaId: persona.id,
        position: { startOffset: 0, endOffset: 0 }
      };

      setAnnotations(prev => [newAnno, ...prev]);
      setActiveAnnotationId(tempId);
    } catch (err) {
      console.error("AI Annotation failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserAnnotate = async (note: string) => {
    if (!pendingSelection || !activeBook || isProcessing) return;
    const selection = pendingSelection;
    setPendingSelection(null);
    setIsProcessing(true);

    try {
      const userAnnoId = Date.now().toString();
      const topic = await summarizeTopic(selection, note, engineConfig);
      
      const userAnno: Annotation = {
        id: userAnnoId,
        bookId: activeBook.id,
        textSelection: selection,
        comment: note,
        author: 'user',
        topic,
        timestamp: Date.now(),
        position: { startOffset: 0, endOffset: 0 }
      };

      setAnnotations(prev => [userAnno, ...prev]);
      setActiveAnnotationId(userAnnoId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const openPersonaEditor = (p?: Persona) => {
    setEditingPersona(p || null);
    setIsPersonaModalOpen(true);
  };

  const openWritingStudio = (book: Book | null = null) => {
    setWritingStudioBook(book);
    setIsWritingStudioOpen(true);
  };

  const activeAnnotation = annotations.find(a => a.id === activeAnnotationId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      {appState === 'library' ? (
        <LibraryView 
          library={library}
          onSelectBook={(id) => { setActiveBookId(id); setAppState('reading'); }}
          onImport={handleImportBook}
          onOpenWritingStudio={() => openWritingStudio()}
          onEditBook={(book) => { setEditingBook(book); setIsBookEditModalOpen(true); }}
          onDeleteBook={handleDeleteBook}
          annotations={annotations}
        />
      ) : (
        <>
          <header className="h-14 border-b border-stone-200 flex items-center justify-between px-6 glass shrink-0 z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => setAppState('library')} className="text-stone-400 hover:text-stone-900 transition-colors flex items-center gap-2 text-sm font-medium">
                <i className="fa-solid fa-book-bookmark"></i>
                <span className="hidden sm:inline">Library</span>
              </button>
              <div className="h-4 w-px bg-stone-200 hidden sm:block" />
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-serif font-bold text-lg text-stone-900 truncate max-w-[150px] sm:max-w-[200px]">{activeBook?.title}</span>
                {activeBook?.isOriginal && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest shrink-0">Draft</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {activeBook?.isOriginal && (
                <button 
                  onClick={() => openWritingStudio(activeBook)}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100 hover:bg-amber-100 transition-all"
                >
                  <i className="fa-solid fa-pen-nib"></i>
                  Edit
                </button>
              )}
              
              {(isProcessing || isAutoScanning) && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-amber-600 animate-pulse font-medium">
                  <i className="fa-solid fa-sparkles"></i>
                  {isAutoScanning ? 'Reading...' : 'Thinking...'}
                </div>
              )}
              
              <div className="h-4 w-px bg-stone-200 hidden sm:block" />
              
              <button 
                onClick={() => setIsSettingsModalOpen(true)}
                className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all" 
                title="Engine Settings"
              >
                <i className="fa-solid fa-gear text-sm"></i>
              </button>

              {/* Mobile Sidebar Toggle */}
              <button 
                onClick={() => setIsMobileSidebarOpen(true)}
                className="md:hidden w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all relative"
              >
                <i className="fa-solid fa-user-group text-sm"></i>
                {isProcessing && <div className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-ping" />}
              </button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden relative">
            <main className="flex-1 overflow-hidden bg-stone-50 relative w-full group">
              {activeBook && (
                <Reader 
                  book={activeBook} 
                  annotations={bookAnnotations} 
                  onAnnotate={handleAnnotateSelection}
                  activeAnnotationId={activeAnnotationId}
                  onSelectAnnotation={setActiveAnnotationId}
                  readingMode={engineConfig.readingMode}
                  onPageChange={handlePageChange}
                  engineConfig={engineConfig}
                  onUpdateConfig={(config) => setEngineConfig({...config})}
                />
              )}

              {/* Mobile/Desktop Floating Write Button for Originals */}
              {activeBook?.isOriginal && (
                <button
                  onClick={() => openWritingStudio(activeBook)}
                  className="absolute bottom-8 right-6 md:bottom-10 md:right-10 z-30 w-12 h-12 md:w-14 md:h-14 bg-stone-900 text-amber-500 rounded-full shadow-2xl flex items-center justify-center hover:bg-stone-800 transition-all hover:scale-110 active:scale-95 border-2 border-stone-800"
                  title="Continue Writing"
                >
                  <i className="fa-solid fa-pen-nib text-lg md:text-xl"></i>
                </button>
              )}
            </main>

            {/* Sidebar Wrapper - Responsive */}
            <div 
              className={`
                fixed inset-0 z-40 bg-white transition-transform duration-300 ease-in-out
                ${isMobileSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
                md:relative md:translate-x-0 md:w-80 md:flex md:border-l md:border-stone-200
              `}
            >
              <Sidebar 
                currentPersona={persona}
                allPersonas={allPersonas}
                onChangePersona={setPersona}
                onOpenPersonaEditor={openPersonaEditor}
                annotations={bookAnnotations}
                activeAnnotationId={activeAnnotationId}
                onSelectAnnotation={(id) => { setActiveAnnotationId(id); setIsMobileSidebarOpen(false); }}
                engineConfig={engineConfig}
                progress={progress}
                onOpenReport={() => setIsReportOpen(true)}
                onClose={() => setIsMobileSidebarOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {isWritingStudioOpen && (
        <WritingStudioModal 
          activePersona={persona}
          existingBook={writingStudioBook}
          onSave={handleSaveCreatedBook}
          onClose={() => setIsWritingStudioOpen(false)}
        />
      )}

      {pendingSelection && (
        <AnnotationActionModal 
          selection={pendingSelection}
          onAIAnnotate={handleAIAnnotate}
          onUserAnnotate={handleUserAnnotate}
          onClose={() => setPendingSelection(null)}
        />
      )}

      {activeAnnotation && (
        <AnnotationModal 
          annotation={activeAnnotation} 
          persona={persona} 
          onClose={() => setActiveAnnotationId(null)}
          engineConfig={engineConfig}
          isOriginal={activeBook?.isOriginal}
        />
      )}

      {isPersonaModalOpen && (
        <PersonaModal 
          persona={editingPersona}
          onSave={(p) => {
            const exists = customPersonas.find(cp => cp.id === p.id);
            if (exists) setCustomPersonas(prev => prev.map(cp => cp.id === p.id ? p : cp));
            else setCustomPersonas(prev => [...prev, p]);
            setPersona(p);
            setIsPersonaModalOpen(false);
          }}
          onDelete={(id) => {
            setCustomPersonas(prev => prev.filter(cp => cp.id !== id));
            if (persona.id === id) setPersona(DEFAULT_PERSONAS[0]);
            setIsPersonaModalOpen(false);
          }}
          onClose={() => setIsPersonaModalOpen(false)}
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal 
          config={engineConfig} 
          onSave={setEngineConfig} 
          onClose={() => setIsSettingsModalOpen(false)} 
        />
      )}

      {isBookEditModalOpen && editingBook && (
        <BookEditModal 
          book={editingBook}
          onSave={(b) => { handleUpdateBook(b); setIsBookEditModalOpen(false); }}
          onDelete={(id) => { handleDeleteBook(id); setIsBookEditModalOpen(false); }}
          onClose={() => setIsBookEditModalOpen(false)}
        />
      )}

      {isReportOpen && activeBook && (
        <ReadingReportModal 
          book={activeBook}
          annotations={bookAnnotations}
          persona={persona}
          engineConfig={engineConfig}
          onClose={() => setIsReportOpen(false)}
          onSaveReview={handleSaveReview}
        />
      )}
    </div>
  );
};

export default App;
