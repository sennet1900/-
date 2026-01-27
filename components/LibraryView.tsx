
import React, { useState, useMemo } from 'react';
import { Book, Annotation, EngineConfig } from '../types';
import { extractTextFromPDF, processImagesWithAI, repairTextWithAI } from '../services/geminiService';

interface LibraryViewProps {
  library: Book[];
  annotations: Annotation[];
  onSelectBook: (id: string) => void;
  onImport: (title: string, content: string, author?: string) => void;
  onOpenWritingStudio: () => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
  onOpenSettings: () => void;
  engineConfig: EngineConfig;
}

const LibraryView: React.FC<LibraryViewProps> = ({ 
  library, 
  annotations, 
  onSelectBook, 
  onImport, 
  onOpenWritingStudio,
  onEditBook,
  onDeleteBook,
  onOpenSettings,
  engineConfig
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  
  // PDF Import Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(library.map(b => b.category));
    return ['全部', ...Array.from(cats).filter(c => c !== 'All')];
  }, [library]);

  const filteredLibrary = useMemo(() => {
    return library.filter(book => {
      const matchesCategory = filterCategory === 'All' || filterCategory === '全部' || book.category === filterCategory;
      const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (book.author?.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [library, filterCategory, searchQuery]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset value so same file can be selected again if cancelled
    e.target.value = '';

    if (file.type === 'application/pdf') {
      setSelectedPdfFile(file);
      setShowPdfModal(true);
    } else {
      // Direct text import for non-PDFs
      processTextFile(file);
    }
  };

  const processTextFile = (file: File) => {
    setIsImporting(true);
    setImportStatus('正在读取文件...');
    const title = file.name.replace(/\.[^/.]+$/, "");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        let content = '';

        // Strategy: Try UTF-8 first (strict), then fallback to GB18030, then loose UTF-8
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          content = decoder.decode(buffer);
        } catch (e) {
          try {
            const decoder = new TextDecoder('gb18030', { fatal: true });
            content = decoder.decode(buffer);
          } catch (e2) {
            const decoder = new TextDecoder('utf-8');
            content = decoder.decode(buffer);
          }
        }

        onImport(title, content);
      } catch (decodeErr) {
        console.error("Decoding failed", decodeErr);
        alert("文件解码失败。");
      } finally {
        setIsImporting(false);
        setImportStatus('');
      }
    };
    
    reader.onerror = () => {
      setIsImporting(false);
      setImportStatus('');
    };
    reader.readAsArrayBuffer(file);
  };

  // Helper: Render PDF pages to Base64 Images
  const renderPdfToImages = async (pdf: any, maxPages: number = 10): Promise<string[]> => {
    const images: string[] = [];
    const total = Math.min(pdf.numPages, maxPages);
    
    for (let i = 1; i <= total; i++) {
       setImportStatus(`视觉渲染中: ${i} / ${total}`);
       const page = await pdf.getPage(i);
       const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for better OCR
       
       const canvas = document.createElement('canvas');
       const context = canvas.getContext('2d');
       if (!context) continue;
       
       canvas.height = viewport.height;
       canvas.width = viewport.width;

       await page.render({ canvasContext: context, viewport: viewport }).promise;
       
       // Convert to JPEG base64 (remove prefix for API)
       const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
       images.push(dataUrl.split(',')[1]);
    }
    return images;
  };

  const executePdfImport = async (mode: 'local' | 'ai') => {
    if (!selectedPdfFile) return;
    setShowPdfModal(false);
    setIsImporting(true);
    const title = selectedPdfFile.name.replace(/\.[^/.]+$/, "");

    // Common PDF Loader
    let pdf: any = null;
    try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
        const arrayBuffer = await selectedPdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdf = await loadingTask.promise;
    } catch (e: any) {
        alert(`PDF 读取失败: ${e.message}`);
        setIsImporting(false);
        setImportStatus('');
        return;
    }

    if (mode === 'local') {
      setImportStatus('本地解析 PDF 中...');
      try {
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          setImportStatus(`解析第 ${i} / ${pdf.numPages} 页...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }

        if (!fullText.trim()) throw new Error("未提取到文本 (可能是纯图片PDF)");
        onImport(title, fullText);

      } catch (err: any) {
        console.error("Local Import Error:", err);
        alert(`本地解析失败: ${err.message}\n建议尝试使用 "AI 智能识别" 模式。`);
      } finally {
        setIsImporting(false);
        setImportStatus('');
        setSelectedPdfFile(null);
      }
    } else {
      // --- AI IMPORT (GENERIC) ---
      setImportStatus('连接 AI 引擎...');
      try {
        if (!engineConfig.apiKey) {
            throw new Error("请先在设置中配置 API Key。");
        }

        let extractedText = '';

        // Branch 1: Gemini (Native PDF Support - Best & Fastest)
        if (engineConfig.provider === 'gemini') {
            setImportStatus('上传 PDF 给 Gemini...');
            extractedText = await extractTextFromPDF(selectedPdfFile, engineConfig);
        } 
        // Branch 2: Other Providers (GPT-4o, Claude, DeepSeek, etc.)
        else {
            // Attempt 1: Vision (OCR) - Best for garbled text
            // Skip Vision if model name explicitly implies text-only and popularly known (e.g., DeepSeek V3)
            // Note: Some users use DeepSeek via aggregators that MIGHT support vision, so we can try-catch.
            const modelName = (engineConfig.model || '').toLowerCase();
            const isLikelyTextOnly = modelName.includes('deepseek') && !modelName.includes('vl');
            
            if (!isLikelyTextOnly) {
                try {
                    setImportStatus('尝试视觉识别 (OCR)...');
                    // Limit to first 20 pages for Vision to prevent timeout/token limits in this demo
                    // A real app would chunk this.
                    const images = await renderPdfToImages(pdf, 20); 
                    setImportStatus('AI 正在阅读图片...');
                    extractedText = await processImagesWithAI(images, engineConfig);
                } catch (visionError: any) {
                    console.warn("Vision failed, falling back to Text Repair", visionError);
                    // If 400 Bad Request, likely model doesn't support vision
                }
            }

            // Attempt 2: Text Repair (Fallback)
            if (!extractedText) {
                setImportStatus('视觉识别不可用，尝试文本提取+修复...');
                
                // Extract Raw Text (likely garbled)
                let rawText = '';
                for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    rawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
                }

                if (!rawText.trim()) throw new Error("无法提取文本，且 AI 视觉识别失败。");

                setImportStatus('AI 正在修复乱码...');
                extractedText = await repairTextWithAI(rawText, engineConfig);
            }
        }
        
        if (!extractedText) throw new Error("AI 未返回任何内容。");
        onImport(title, extractedText);

      } catch (err: any) {
        console.error("AI Import Error:", err);
        alert(`AI 识别失败: ${err.message}\n\n提示: 如果使用 DeepSeek 等纯文本模型，请尝试切换到 Gemini 或 GPT-4o 以获得最佳的 PDF 识别效果。`);
      } finally {
        setIsImporting(false);
        setImportStatus('');
        setSelectedPdfFile(null);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50">
      {/* PDF Selection Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-stone-200 p-6 animate-slideUp">
              <h3 className="text-xl font-serif font-bold text-stone-900 mb-2">选择 PDF 导入方式</h3>
              <p className="text-sm text-stone-500 mb-6">检测到 PDF 文件。请选择解析引擎:</p>
              
              <div className="space-y-3">
                 <button 
                   onClick={() => executePdfImport('local')}
                   className="w-full p-4 rounded-xl border border-stone-200 hover:border-stone-400 hover:bg-stone-50 text-left transition-all flex items-center gap-4 group"
                 >
                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 group-hover:bg-white group-hover:shadow-sm">
                       <i className="fa-solid fa-bolt"></i>
                    </div>
                    <div>
                       <div className="font-bold text-stone-800">本地快速解析</div>
                       <div className="text-xs text-stone-400">速度快，无需流量。适合标准文字版 PDF。</div>
                    </div>
                 </button>

                 <button 
                   onClick={() => executePdfImport('ai')}
                   className="w-full p-4 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 text-left transition-all flex items-center gap-4 group"
                 >
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 group-hover:bg-white group-hover:shadow-sm">
                       <i className="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <div>
                       <div className="font-bold text-stone-900">AI 智能识别 (通用)</div>
                       <div className="text-xs text-stone-500">
                          使用当前连接的 AI ({engineConfig.provider === 'gemini' ? 'Gemini' : engineConfig.model || 'OpenAI'})。<br/>
                          <span className="text-amber-700 font-bold">视觉识别 (OCR)</span> 或 <span className="text-amber-700 font-bold">乱码修复</span>。
                       </div>
                    </div>
                 </button>
              </div>

              <button 
                onClick={() => { setShowPdfModal(false); setSelectedPdfFile(null); }}
                className="mt-6 w-full py-3 text-stone-400 hover:text-stone-600 font-bold text-xs"
              >
                取消导入
              </button>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="px-8 py-10 bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-serif font-bold text-stone-900 tracking-tight">SoulReader 灵感书房</h1>
            <p className="text-stone-500 mt-2">重拾阅读进度，或开启新的视野。</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Settings Button */}
            <button 
              onClick={onOpenSettings}
              className={`w-12 h-12 border rounded-2xl flex items-center justify-center transition-all shadow-sm ${!engineConfig.apiKey && !process.env.API_KEY ? 'bg-red-50 border-red-200 text-red-500 animate-pulse' : 'bg-white border-stone-200 text-stone-400 hover:text-stone-900 hover:bg-stone-50'}`}
              title="设置"
            >
               <i className="fa-solid fa-gear text-lg"></i>
            </button>
            
            <div className="h-8 w-px bg-stone-200 mx-1"></div>

            <button 
              onClick={onOpenWritingStudio}
              className="px-6 py-3 bg-white border border-stone-200 text-stone-700 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-stone-50 transition-all shadow-sm"
            >
              <i className="fa-solid fa-feather-pointed text-amber-600"></i>
              <span>写作工坊</span>
            </button>
            <div className="relative group">
              <input 
                type="file" 
                accept=".txt,.md,.pdf" 
                onChange={handleFileUpload}
                disabled={isImporting}
                className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <button className={`px-6 py-3 bg-stone-900 text-white rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-stone-800 transition-all shadow-lg ${isImporting ? 'opacity-80' : ''}`}>
                {isImporting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-plus"></i>}
                <span>{isImporting ? (importStatus || '处理中...') : '导入书籍'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Filters & Search */}
      <div className="px-8 py-6 bg-stone-50/50 border-b border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  filterCategory === cat 
                  ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-200' 
                  : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <div className="relative w-full md:w-64">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-xs"></i>
            <input 
              type="text"
              placeholder="搜索书名或作者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Books Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {filteredLibrary.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-stone-200">
              <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-book text-3xl text-stone-300"></i>
              </div>
              <h3 className="text-xl font-bold text-stone-800">暂无书籍</h3>
              <p className="text-stone-400 max-w-xs mx-auto mt-2">导入你的第一本 TXT/PDF 书籍，或开始写作。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filteredLibrary.map(book => {
                const bookAnnos = annotations.filter(a => a.bookId === book.id).length;
                return (
                  <div key={book.id} className="group relative">
                    <div 
                      onClick={() => onSelectBook(book.id)}
                      className="bg-white rounded-2xl border border-stone-200 p-6 h-full flex flex-col transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden relative"
                    >
                      {/* Book Spine Color Accents */}
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-1.5" 
                        style={{ backgroundColor: book.coverColor }}
                      />
                      
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 py-1 bg-stone-50 rounded">
                          {book.category}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditBook(book); }}
                          className="w-8 h-8 rounded-full bg-stone-50 text-stone-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-stone-900 transition-all"
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                      </div>

                      <h3 className="text-xl font-serif font-bold text-stone-900 line-clamp-2 leading-tight mb-2">
                        {book.title}
                      </h3>
                      <p className="text-sm text-stone-500 mb-6 italic">{book.author}</p>
                      
                      <div className="mt-auto space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <i className="fa-solid fa-comment-dots"></i>
                            {bookAnnos} 条批注
                          </span>
                          <span>{new Date(book.addedAt).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-amber-500 opacity-60" 
                             style={{ width: `${Math.min(100, (bookAnnos / 10) * 100)}%` }} // Purely visual progress based on annos
                           />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryView;
