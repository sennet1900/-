
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Book, Annotation, Persona, AppState, EngineConfig, WritingMetadata } from './types';
import { DEFAULT_PERSONAS } from './constants';
import { generateAIAnnotation, summarizeTopic, autonomousScan, consolidateMemory, chatWithPersona, generateAIResponseToUserNote } from './services/geminiService';
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
import Toast from './components/Toast';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  // Notification State
  const [hasNewThoughts, setHasNewThoughts] = useState(false);
  
  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
  };

  const [library, setLibrary] = useState<Book[]>(() => {
    const saved = localStorage.getItem('sr_library');
    return saved ? JSON.parse(saved) : [];
  });

  // UNIFIED PERSONA MANAGEMENT
  const [personas, setPersonas] = useState<Persona[]>(() => {
    // 1. Check for the unified list first
    const savedActive = localStorage.getItem('sr_active_personas');
    if (savedActive) {
      try {
        const parsed = JSON.parse(savedActive);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse active personas", e);
      }
    }

    // 2. Fallback: Use the (now minimal) defaults directly.
    return [...DEFAULT_PERSONAS];
  });

  // Persist the unified list whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('sr_active_personas', JSON.stringify(personas));
    } catch (e) {
      console.error("Storage Quota Exceeded for Personas", e);
      // We can't call showToast here easily as it might cause loops, but the catch prevents the white screen.
      // If critical, we could set a state flag to warn the user.
    }
  }, [personas]);

  const [persona, setPersona] = useState<Persona>(() => {
    if (personas.length > 0) return personas[0];
    return DEFAULT_PERSONAS[0];
  });

  // SAFETY EFFECT: Ensure active persona is always valid
  useEffect(() => {
    if (personas.length > 0) {
      const currentExists = personas.find(p => p.id === persona.id);
      if (!currentExists) {
        setPersona(personas[0]);
      }
    }
  }, [personas, persona.id]);

  const [engineConfig, setEngineConfig] = useState<EngineConfig>(() => {
    const saved = localStorage.getItem('sr_engine_config');
    return saved ? JSON.parse(saved) : {
      provider: 'gemini', // Default to Gemini
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: '',
      model: 'gemini-3-flash-preview',
      temperature: 0.7,
      useThinking: true,
      githubToken: '',
      backupGistId: '',
      autoMemoryThreshold: 100, // Default 100
      enableShortTermMemory: false, // Default false
      shortTermMemoryCount: 5, // Default 5
      aiFont: 'Crimson Pro',
      userFont: 'Inter',
      readingMode: 'horizontal',
      autonomousReading: false,
      autoAnnotationCount: 2,
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
  
  // New: Track background processing IDs
  const [processingAnnotationIds, setProcessingAnnotationIds] = useState<Set<string>>(new Set());
  
  // Legacy loading state (kept for initial AI generation blocking if needed, though most moved to background)
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
  const [annotationModalMode, setAnnotationModalMode] = useState<'choice' | 'input'>('choice');
  const [progress, setProgress] = useState(0);
  const lastScannedPageRef = useRef<string | null>(null);
  const lastConsolidatedCountRef = useRef<number>(0);

  const activeBook = useMemo(() => library.find(b => b.id === activeBookId) || null, [library, activeBookId]);
  
  const bookAnnotations = useMemo(() => {
    return annotations
      .filter(a => a.bookId === activeBookId && (!a.personaId || a.personaId === persona.id))
      .sort((a,b) => b.timestamp - a.timestamp);
  }, [annotations, activeBookId, persona.id]);

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
    try {
      localStorage.setItem('sr_library', JSON.stringify(library));
    } catch (e) {
       console.error("Storage limit exceeded for Library", e);
    }
  }, [library]);

  useEffect(() => {
    try {
      localStorage.setItem('sr_annotations', JSON.stringify(annotations));
    } catch (e) {
      console.error("Storage limit exceeded for Annotations", e);
    }
  }, [annotations]);

  useEffect(() => {
    localStorage.setItem('sr_engine_config', JSON.stringify(engineConfig));
  }, [engineConfig]);

  // Auto-Memory Logic
  useEffect(() => {
    if (
      engineConfig.autoMemoryThreshold > 0 && 
      activeBook && 
      bookAnnotations.length > 0 &&
      bookAnnotations.length % engineConfig.autoMemoryThreshold === 0 &&
      bookAnnotations.length !== lastConsolidatedCountRef.current &&
      (engineConfig.apiKey || process.env.API_KEY)
    ) {
      lastConsolidatedCountRef.current = bookAnnotations.length;
      
      const runAutoMemory = async () => {
        showToast("正在整合长期记忆...", "info");
        try {
          const newMemory = await consolidateMemory(persona, activeBook.title, bookAnnotations, engineConfig);
          // Update Persona
          const updatedPersona = { ...persona, longTermMemory: newMemory };
          
          if (updatedPersona.id === persona.id) {
             setPersona(updatedPersona);
             // Update in persistent list
             setPersonas(prev => prev.map(p => p.id === updatedPersona.id ? updatedPersona : p));
          }
          
          showToast("记忆核心已更新。", "success");
        } catch (e) {
          console.error("Auto memory failed", e);
        }
      };

      runAutoMemory();
    }
  }, [bookAnnotations.length, engineConfig.autoMemoryThreshold, activeBook, persona, engineConfig]);


  const validateAPI = useCallback(() => {
    if (!engineConfig.apiKey && !process.env.API_KEY) {
      showToast("请先在设置中配置 API Key。", "error");
      setIsSettingsModalOpen(true);
      return false;
    }
    return true;
  }, [engineConfig.apiKey]);

  const handleImportBook = (title: string, content: string, author?: string) => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899'];
    const newBook: Book = {
      id: Date.now().toString(),
      title,
      content,
      author: author || '佚名',
      category: '未分类',
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      addedAt: Date.now(),
      timeSpent: 0,
      isOriginal: false
    };
    try {
      setLibrary(prev => [newBook, ...prev]);
      setActiveBookId(newBook.id);
      setAppState('reading');
      showToast(`已导入 "${title}"`, "success");
    } catch (e) {
       showToast("存储空间不足，无法导入。", "error");
    }
  };

  const handleSaveCreatedBook = async (
    title: string, 
    content: string, 
    author: string, 
    category: string, 
    existingId?: string,
    writingMetadata?: WritingMetadata
  ) => {
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899'];
    const newId = existingId || Date.now().toString();
    
    try {
      if (existingId) {
        setLibrary(prev => prev.map(b => b.id === existingId ? { ...b, title, content, author, category, writingMetadata } : b));
        showToast("作品同步成功", "success");
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
          isOriginal: true,
          writingMetadata
        };
        setLibrary(prev => [newBook, ...prev]);
        showToast("新作品已创建!", "success");
      }
      
      setIsWritingStudioOpen(false);
      setActiveBookId(newId);
      setAppState('reading');
      
      if (engineConfig.apiKey || process.env.API_KEY) {
          setTimeout(async () => {
          try {
              const firstPara = content.split('\n')[0] || content;
              const results = await autonomousScan(firstPara, persona, engineConfig, true, title);
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
              setHasNewThoughts(true); // Notify user without toast
              }
          } catch (e) {
              console.error("Initial scan for user book failed", e);
          }
          }, 1500);
      }
    } catch (e) {
      showToast("保存失败: 存储空间不足", "error");
    }
  };

  const handlePageChange = useCallback(async (content: string, p: number, pageIndex: number, scrollRatio?: number) => {
    setProgress(p);
    
    if (activeBookId) {
        setLibrary(prev => prev.map(b => 
            b.id === activeBookId ? { 
                ...b, 
                lastReadPage: pageIndex,
                lastScrollRatio: scrollRatio !== undefined ? scrollRatio : b.lastScrollRatio
            } : b
        ));
    }

    if (!engineConfig.autonomousReading || !activeBookId || isAutoScanning || lastScannedPageRef.current === content) return;
    
    if (!engineConfig.apiKey && !process.env.API_KEY) return;

    const existingSelections = bookAnnotations.map(a => a.textSelection);
    setIsAutoScanning(true);
    lastScannedPageRef.current = content;

    try {
      // Pass activeBook.title to autonomousScan
      const results = await autonomousScan(content, persona, engineConfig, activeBook?.isOriginal, activeBook?.title);
      
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
         setHasNewThoughts(true); // Set red dot notification instead of toast
      }
    } catch (err: any) {
      console.error("Autonomous scan failed:", err);
    } finally {
      setIsAutoScanning(false);
    }
  }, [engineConfig.autonomousReading, engineConfig.model, engineConfig.autoAnnotationCount, engineConfig.apiKey, activeBookId, persona, isAutoScanning, bookAnnotations, activeBook?.isOriginal, activeBook?.title]);

  const handleDeleteBook = (id: string) => {
    setLibrary(prev => prev.filter(b => b.id !== id));
    setAnnotations(prev => prev.filter(a => a.bookId !== id));
    if (activeBookId === id) {
      setActiveBookId(null);
      setAppState('library');
    }
    showToast("书籍已删除", "info");
  };

  const handleUpdateBook = (updatedBook: Book) => {
    setLibrary(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const handleDeleteAnnotation = (id: string) => {
    if (window.confirm("确定要删除这条批注吗？")) {
      setAnnotations(prev => prev.filter(a => a.id !== id));
      if (activeAnnotationId === id) setActiveAnnotationId(null);
      showToast("批注已删除", "info");
    }
  };

  // New: Batch Delete
  const handleBatchDeleteAnnotations = (ids: string[]) => {
    if (window.confirm(`确定要删除选中的 ${ids.length} 条批注吗？`)) {
        setAnnotations(prev => prev.filter(a => !ids.includes(a.id)));
        if (activeAnnotationId && ids.includes(activeAnnotationId)) {
            setActiveAnnotationId(null);
        }
        showToast(`已删除 ${ids.length} 条批注`, "info");
    }
  };

  const handleSaveReview = (rating: number, review: string, aiResponse?: string, aiLongReview?: string) => {
    if (!activeBookId) return;
    setLibrary(prev => prev.map(b => 
      b.id === activeBookId ? { ...b, rating, userReview: review, aiReview: aiLongReview } : b
    ));
    showToast("书评已保存!", "success");
  };

  // BACKGROUND AI TRIGGER
  // This function allows AI to reply in background while user continues reading
  const handleTriggerAIReply = async (annotationId: string, userMessage: string, contextChatHistory: { role: string; text: string }[]) => {
    const targetAnno = annotations.find(a => a.id === annotationId);
    if (!targetAnno) return;

    // 1. Optimistic update with user message (if any)
    let historyForAI = [...contextChatHistory];
    if (userMessage) {
        const userMsgObj = { role: 'user', text: userMessage };
        historyForAI.push(userMsgObj);
        
        // Update global state immediately
        setAnnotations(prev => prev.map(a => a.id === annotationId ? { 
            ...a, 
            chatHistory: historyForAI 
        } : a));
    }

    // 2. Add to processing list (Background)
    setProcessingAnnotationIds(prev => new Set(prev).add(annotationId));

    // 3. Perform AI Call
    try {
        // PREPARE SHORT TERM MEMORY
        // Get recent annotations, exclude current one
        const recentAnnos = engineConfig.enableShortTermMemory 
            ? bookAnnotations.filter(a => a.id !== annotationId).slice(0, engineConfig.shortTermMemoryCount || 5).reverse() // Pass as chronologically ascending
            : [];

        // Pass activeBook.title to chatWithPersona
        const reply = await chatWithPersona(
            userMessage || "（继续）", // Fallback if empty trigger
            targetAnno.textSelection,
            persona,
            contextChatHistory, // The history BEFORE the new user message
            engineConfig,
            activeBook?.isOriginal,
            activeBook?.title || "未知书籍",
            activeBook?.content || "", // Pass content here to extract context
            recentAnnos // NEW: Pass recent annotations
        );

        // 4. Update with AI Response
        setAnnotations(prev => prev.map(a => {
            if (a.id === annotationId) {
                // We need to append to the *current* state of the annotation, 
                // in case the user added more messages while AI was thinking (rare but possible)
                // However, for simplicity, we append to the history we built earlier + AI reply.
                const newHistory = [...historyForAI, { role: 'model', text: reply }];
                return { ...a, chatHistory: newHistory };
            }
            return a;
        }));

    } catch (err) {
        console.error("Background AI failed", err);
        showToast("AI 回复失败，请稍后重试", "error");
        // Add error message to chat
        setAnnotations(prev => prev.map(a => a.id === annotationId ? {
             ...a,
             chatHistory: [...historyForAI, { role: 'model', text: "抱歉，我的思绪中断了。" }]
        } : a));
    } finally {
        // 5. Remove from processing list
        setProcessingAnnotationIds(prev => {
            const next = new Set(prev);
            next.delete(annotationId);
            return next;
        });
    }
  };

  // UPDATED: Now ONLY saves the user note and generates a topic.
  // It does NOT trigger an AI reply automatically.
  const handleUserAnnotate = async (note: string) => {
    if (!pendingSelection || !activeBook) return;
    if (!validateAPI()) return;

    const selection = pendingSelection;
    setPendingSelection(null);
    
    const userAnnoId = Date.now().toString();
    
    try {
      const initialHistory = [{ role: 'user', text: note }];

      const userAnno: Annotation = {
        id: userAnnoId,
        bookId: activeBook.id,
        textSelection: selection,
        comment: note,
        author: 'user',
        topic: "随想", // Temporary topic
        timestamp: Date.now(),
        personaId: persona.id, 
        position: { startOffset: 0, endOffset: 0 },
        chatHistory: initialHistory
      };

      setAnnotations(prev => [userAnno, ...prev]);
      setActiveAnnotationId(userAnnoId);
      showToast("笔记已保存", "success");

      // Background Topic Generation ONLY (Silent)
      (async () => {
         try {
             const genTopic = await summarizeTopic(selection, note, engineConfig);
             setAnnotations(prev => prev.map(a => a.id === userAnnoId ? {
                 ...a,
                 topic: genTopic
             } : a));
         } catch (e) {
             console.error("Topic generation failed", e);
         }
      })();

    } catch (err: any) {
      console.error(err);
      showToast(`保存笔记错误: ${err.message}`, "error");
    }
  };

  const executeAIAnnotation = useCallback(async (selection: string) => {
    if (!activeBook || isProcessing) return;
    if (!validateAPI()) return; 

    const tempId = Date.now().toString();
    
    // OPTIMISTIC UPDATE: Create placeholder annotation immediately
    const optimisticAnno: Annotation = {
      id: tempId,
      bookId: activeBook.id,
      textSelection: selection,
      comment: "", // Empty initially
      author: 'ai',
      topic: "思考中...",
      timestamp: Date.now(),
      personaId: persona.id,
      position: { startOffset: 0, endOffset: 0 },
      chatHistory: [] // Empty chat history, Modal will show loading bubble
    };

    setIsProcessing(true);
    setAnnotations(prev => [optimisticAnno, ...prev]);
    setActiveAnnotationId(tempId);
    setProcessingAnnotationIds(prev => new Set(prev).add(tempId));

    try {
      // PREPARE SHORT TERM MEMORY
      // Get recent annotations, reverse to make chronological
      const recentAnnos = engineConfig.enableShortTermMemory 
            ? bookAnnotations.slice(0, engineConfig.shortTermMemoryCount || 5).reverse() 
            : [];

      // Pass activeBook.title to generateAIAnnotation
      const comment = await generateAIAnnotation(
          selection, 
          activeBook.content, 
          persona, 
          engineConfig, 
          activeBook.isOriginal, 
          activeBook.title,
          recentAnnos // NEW: Pass recent annos
      );
      
      if (!comment) throw new Error("AI 返回了空内容");

      const topic = await summarizeTopic(selection, comment, engineConfig);
      
      const finalAnno: Annotation = {
        id: tempId,
        bookId: activeBook.id,
        textSelection: selection,
        comment,
        author: 'ai',
        topic,
        timestamp: Date.now(),
        personaId: persona.id,
        position: { startOffset: 0, endOffset: 0 },
        chatHistory: [{ role: 'model', text: comment }]
      };

      setAnnotations(prev => prev.map(a => a.id === tempId ? finalAnno : a));
      showToast("AI 批注已生成", "success");
    } catch (err: any) {
      console.error("AI Annotation failed:", err);
      showToast(`AI 错误: ${err.message || '未知错误'}`, "error");
      // Rollback
      setAnnotations(prev => prev.filter(a => a.id !== tempId));
      if (activeAnnotationId === tempId) setActiveAnnotationId(null);
    } finally {
      setIsProcessing(false);
      setProcessingAnnotationIds(prev => {
         const next = new Set(prev);
         next.delete(tempId);
         return next;
      });
    }
  }, [activeBook, isProcessing, persona, engineConfig, validateAPI, activeAnnotationId, bookAnnotations]);

  const handleAnnotateSelection = useCallback((selection: string, start: number, end: number, intent?: 'ai' | 'user') => {
    if (intent === 'ai') {
        executeAIAnnotation(selection);
    } else if (intent === 'user') {
        setAnnotationModalMode('input');
        setPendingSelection(selection);
    } else {
        setAnnotationModalMode('choice');
        setPendingSelection(selection);
    }
  }, [executeAIAnnotation]);

  // NEW: Unified handler to select annotation and clear notification
  const handleSelectAnnotation = (id: string) => {
    setActiveAnnotationId(id);
    // User interacted with an annotation, so we clear the "New Thoughts" indicator
    setHasNewThoughts(false);
  };

  const handleAIAnnotate = async () => {
    if (!pendingSelection) return;
    const selection = pendingSelection;
    setPendingSelection(null);
    executeAIAnnotation(selection);
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

  const handleSavePersona = (p: Persona) => {
    try {
      setPersonas(prev => {
        const exists = prev.find(item => item.id === p.id);
        if (exists) {
          return prev.map(item => item.id === p.id ? p : item);
        } else {
          return [...prev, p];
        }
      });
      // Immediately select if it's new or currently active
      if (p.id === persona.id || personas.length === 0) {
          setPersona(p);
      }
      
      if (activeBookId) {
        setLibrary(prev => prev.map(b => 
          b.id === activeBookId ? { ...b, lastPersonaId: p.id } : b
        ));
      }
      
      setIsPersonaModalOpen(false);
    } catch (e) {
      showToast("无法保存: 图片可能太大 (限制 5MB)", "error");
    }
  };

  const handleDeletePersona = (id: string) => {
    if (window.confirm("确定要删除这个共读伙伴吗？此操作无法撤销。")) {
       setPersonas(prevPersonas => {
         const newList = prevPersonas.filter(p => p.id !== id);
         
         if (newList.length === 0) {
             const newBlankPersona: Persona = {
               id: Date.now().toString(),
               name: '新伙伴',
               role: '阅读伴侣',
               relationship: '朋友',
               description: '一个新的开始。',
               avatar: '👤',
               systemInstruction: '你是一位友好的阅读伙伴。'
             };
             showToast("删除了最后一个伙伴，已自动创建新角色。", "info");
             return [newBlankPersona];
         }
         
         showToast("伙伴已删除", "info");
         return newList;
       });
       
       setIsPersonaModalOpen(false);
    }
  };

  const handleOpenBook = (id: string) => {
    const book = library.find(b => b.id === id);
    if (book) {
      if (book.lastPersonaId) {
        const savedPersona = personas.find(p => p.id === book.lastPersonaId);
        if (savedPersona) {
          setPersona(savedPersona);
        }
      }
      setActiveBookId(id);
      setAppState('reading');
    }
  };

  const handlePersonaChange = (newPersona: Persona) => {
    setPersona(newPersona);
    if (activeBookId) {
       setLibrary(prev => prev.map(b => 
         b.id === activeBookId ? { ...b, lastPersonaId: newPersona.id } : b
       ));
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      {/* Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {appState === 'library' ? (
        <LibraryView 
          library={library}
          onSelectBook={handleOpenBook}
          onImport={handleImportBook}
          onOpenWritingStudio={() => openWritingStudio()}
          onEditBook={(book) => { setEditingBook(book); setIsBookEditModalOpen(true); }}
          onDeleteBook={handleDeleteBook}
          annotations={annotations}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          engineConfig={engineConfig}
        />
      ) : (
        <>
          <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b border-stone-200 flex items-center justify-between px-6 glass shrink-0 z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => setAppState('library')} className="text-stone-400 hover:text-stone-900 transition-colors flex items-center gap-2 text-sm font-medium">
                <i className="fa-solid fa-book-bookmark"></i>
                <span className="hidden sm:inline">书房</span>
              </button>
              <div className="h-4 w-px bg-stone-200 hidden sm:block" />
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="font-serif font-bold text-lg text-stone-900 truncate max-w-[150px] sm:max-w-[200px]">{activeBook?.title}</span>
                {activeBook?.isOriginal && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest shrink-0">草稿</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {activeBook?.isOriginal && (
                <button 
                  onClick={() => openWritingStudio(activeBook)}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100 hover:bg-amber-100 transition-all"
                >
                  <i className="fa-solid fa-pen-nib"></i>
                  编辑
                </button>
              )}
              
              {(isProcessing || isAutoScanning || processingAnnotationIds.size > 0) && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-amber-600 animate-pulse font-medium">
                  <i className="fa-solid fa-sparkles"></i>
                  {isAutoScanning ? '阅读中...' : '思考中...'}
                </div>
              )}
              
              <div className="h-4 w-px bg-stone-200 hidden sm:block" />
              
              {/* Settings */}
              <button 
                onClick={() => setIsSettingsModalOpen(true)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${!engineConfig.apiKey && !process.env.API_KEY ? 'text-red-500 bg-red-50 animate-pulse' : 'text-stone-400 hover:text-stone-900 hover:bg-stone-100'}`} 
                title="引擎设置"
              >
                <i className="fa-solid fa-gear text-lg"></i>
              </button>

              {/* Persona / Sidebar Toggle / Notification Center */}
              <button 
                onClick={() => {
                  setIsMobileSidebarOpen(true);
                  setHasNewThoughts(false);
                }}
                className="w-10 h-10 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-all relative"
                title="共读伙伴与想法"
              >
                <i className="fa-solid fa-user-group text-lg"></i>
                
                {/* Processing State (Amber) */}
                {(isProcessing || processingAnnotationIds.size > 0) && !hasNewThoughts && (
                   <div className="absolute top-2 right-2 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                )}

                {/* New Thoughts State (Red Halo) */}
                {hasNewThoughts && (
                   <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-white"></span>
                   </span>
                )}
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
                  onSelectAnnotation={handleSelectAnnotation}
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
                  title="继续写作"
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
                allPersonas={personas}
                onChangePersona={handlePersonaChange}
                onOpenPersonaEditor={openPersonaEditor}
                annotations={bookAnnotations}
                activeAnnotationId={activeAnnotationId}
                onSelectAnnotation={(id) => { handleSelectAnnotation(id); setIsMobileSidebarOpen(false); }}
                onDeleteAnnotation={handleDeleteAnnotation}
                onBatchDeleteAnnotations={handleBatchDeleteAnnotations} // Passed here
                engineConfig={engineConfig}
                progress={progress}
                onOpenReport={() => setIsReportOpen(true)}
                onClose={() => setIsMobileSidebarOpen(false)}
                // PASSING THE BACKGROUND STATE
                processingAnnotationIds={processingAnnotationIds}
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
          initialMode={annotationModalMode}
        />
      )}

      {activeAnnotation && (
        <AnnotationModal 
          annotation={activeAnnotation} 
          persona={persona} 
          onClose={() => setActiveAnnotationId(null)}
          onUpdate={handleUpdateAnnotation}
          // PASSING TRIGGER AND STATE
          onTriggerAI={(msg, hist) => handleTriggerAIReply(activeAnnotation.id, msg, hist)}
          isProcessing={processingAnnotationIds.has(activeAnnotation.id)}
          engineConfig={engineConfig}
          isOriginal={activeBook?.isOriginal}
        />
      )}

      {isPersonaModalOpen && (
        <PersonaModal 
          persona={editingPersona}
          activeBook={activeBook}
          bookAnnotations={bookAnnotations}
          engineConfig={engineConfig}
          onSave={handleSavePersona}
          onDelete={handleDeletePersona}
          onClose={() => setIsPersonaModalOpen(false)}
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal 
          config={engineConfig} 
          onSave={(newConfig) => {
             setEngineConfig(newConfig);
             if (!newConfig.apiKey && !process.env.API_KEY) {
                showToast("警告: API Key 仍未配置", "info");
             } else {
                showToast("设置已保存!", "success");
             }
          }} 
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
