
import React, { useState, useMemo, useRef } from 'react';
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
  
  // Import States
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [importProgress, setImportProgress] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  
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

  // Cancel Handler
  const handleCancelImport = () => {
    if (abortControllerRef.current) {
       abortControllerRef.current.abort();
    }
    setIsImporting(false);
    setImportStatus('');
    setImportProgress(0);
    setShowAbortConfirm(false);
    setSelectedPdfFile(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset value so same file can be selected again if cancelled
    e.target.value = '';

    const lowerName = file.name.toLowerCase();

    if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      setSelectedPdfFile(file);
      setShowPdfModal(true);
    } else if (file.type === 'application/epub+zip' || lowerName.endsWith('.epub')) {
      // Direct EPUB processing
      processEpubFile(file);
    } else {
      // Direct text import for non-PDFs/EPUBs
      processTextFile(file);
    }
  };

  // --- EPUB PROCESSING LOGIC ---
  // Replicates the Java logic: Unzip -> Get Spine -> Read HTML -> Jsoup (DOMParser) -> Text
  const processEpubFile = async (file: File) => {
    setIsImporting(true);
    setImportStatus('正在解压 EPUB...');
    setImportProgress(10);
    const title = file.name.replace(/\.[^/.]+$/, "");

    try {
        // Dynamic import JSZip from the importmap
        // @ts-ignore
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);

        // 1. Locate the OPF file (container.xml)
        const containerXml = await zip.file("META-INF/container.xml")?.async("string");
        if (!containerXml) throw new Error("无效的 EPUB: 找不到 container.xml");

        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, "application/xml");
        const rootfilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");

        if (!rootfilePath) throw new Error("无效的 EPUB: 找不到 OPF 路径");

        // 2. Parse OPF to get Manifest (files) and Spine (order)
        const opfContent = await zip.file(rootfilePath)?.async("string");
        if (!opfContent) throw new Error("无法读取 OPF 文件");

        const opfDoc = parser.parseFromString(opfContent, "application/xml");
        const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
        const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));

        // Create a map for quick ID lookup
        // Be careful with relative paths. rootfilePath might be "OEBPS/content.opf", 
        // so resources are relative to "OEBPS/"
        const rootDir = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1);

        const idToHref: Record<string, string> = {};
        manifestItems.forEach(item => {
            const id = item.getAttribute("id");
            const href = item.getAttribute("href");
            if (id && href) idToHref[id] = rootDir + href;
        });

        // 3. Iterate Spine (Chapters)
        let fullBookText = "";
        const totalSpine = spineItems.length;

        for (let i = 0; i < totalSpine; i++) {
            setImportStatus(`解析章节: ${i + 1}/${totalSpine}`);
            setImportProgress(20 + Math.round((i / totalSpine) * 70));

            const idref = spineItems[i].getAttribute("idref");
            if (!idref) continue;

            const href = idToHref[idref];
            if (!href) continue;

            const fileData = await zip.file(href)?.async("string");
            if (!fileData) continue;

            // 4. Parse HTML (Like Jsoup)
            const htmlDoc = parser.parseFromString(fileData, "application/xhtml+xml") || parser.parseFromString(fileData, "text/html");
            
            // Extract Title (Optional context) - analogous to Jsoup.select("h1, h2")
            const chapterTitle = htmlDoc.querySelector("h1, h2, h3")?.textContent?.trim() || "";
            
            // Extract Body Text
            // We iterate nodes to add newlines for block elements to keep formatting clean
            const bodyText = extractTextFromNode(htmlDoc.body);
            
            if (chapterTitle && !bodyText.includes(chapterTitle)) {
                 fullBookText += `\n\n=== ${chapterTitle} ===\n\n`;
            }
            fullBookText += bodyText + "\n";
        }

        setImportStatus('优化排版...');
        const optimizedText = optimizeExtractedText(fullBookText);
        
        setImportProgress(100);
        onImport(title, optimizedText);

    } catch (err: any) {
        console.error("EPUB Import Error:", err);
        alert(`EPUB 解析失败: ${err.message}`);
    } finally {
        setIsImporting(false);
        setImportStatus('');
        setImportProgress(0);
    }
  };

  // Helper to extract text similar to Jsoup.text() but preserving some structure
  const extractTextFromNode = (node: Node): string => {
      if (!node) return "";
      
      if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent || "";
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = (node as Element).tagName.toLowerCase();
          
          // Block elements imply newlines
          const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'li', 'tr'].includes(tagName);
          
          let text = "";
          const children = Array.from(node.childNodes);
          for (const child of children) {
              text += extractTextFromNode(child);
          }
          
          if (tagName === 'br') return "\n";
          if (isBlock) return "\n" + text.trim() + "\n";
          return text;
      }
      return "";
  };


  const processTextFile = (file: File) => {
    setIsImporting(true);
    setImportStatus('正在读取文件...');
    setImportProgress(10);
    const title = file.name.replace(/\.[^/.]+$/, "");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        setImportProgress(50);
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
        
        setImportProgress(100);
        onImport(title, content);
      } catch (decodeErr) {
        console.error("Decoding failed", decodeErr);
        alert("文件解码失败。");
      } finally {
        setIsImporting(false);
        setImportStatus('');
        setImportProgress(0);
      }
    };
    
    reader.onerror = () => {
      setIsImporting(false);
      setImportStatus('');
      setImportProgress(0);
    };
    reader.readAsArrayBuffer(file);
  };

  // Helper: Render PDF pages to Base64 Images
  const renderPdfToImages = async (pdf: any, signal: AbortSignal, maxPages: number = 10): Promise<string[]> => {
    const images: string[] = [];
    const total = Math.min(pdf.numPages, maxPages);
    
    for (let i = 1; i <= total; i++) {
       if (signal.aborted) throw new Error("AbortError");

       setImportStatus(`视觉渲染: ${i}/${total}`);
       setImportProgress(Math.round((i / total) * 100));
       
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

  // --- LOCAL FORMATTING OPTIMIZER ---
  const optimizeExtractedText = (text: string): string => {
    if (!text) return "";

    // 1. Remove spaces between Chinese characters (Heuristic)
    // Matches: [Chinese] space [Chinese] -> removes space
    let cleaned = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

    // 2. Paragraph Reconstruction
    // Split by newline
    const lines = cleaned.split('\n');
    let result = '';
    let buffer = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      if (!buffer) {
        buffer = trimmed;
        continue;
      }

      // Check if the previous buffer ended with a "sentence terminator"
      // If it ends with punctuation, we assume it *might* be a paragraph end.
      const lastChar = buffer[buffer.length - 1];
      const isSentenceEnd = /[。！？：…\.\!\?\:\"]/.test(lastChar);

      if (isSentenceEnd) {
        // Assume paragraph break
        result += buffer + '\n\n';
        buffer = trimmed;
      } else {
        // Assume line wrap (broken line)
        // Check if we need to add a space (English) or just join (Chinese)
        const lastIsCJK = /[\u4e00-\u9fa5]/.test(lastChar);
        const currIsCJK = /[\u4e00-\u9fa5]/.test(trimmed[0]);

        if (lastIsCJK || currIsCJK) {
          buffer += trimmed;
        } else {
          buffer += ' ' + trimmed;
        }
      }
    }
    
    if (buffer) result += buffer;
    
    return result;
  };

  const executePdfImport = async (mode: 'local' | 'ai') => {
    if (!selectedPdfFile) return;
    
    // Init AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setShowPdfModal(false);
    setIsImporting(true);
    setImportProgress(5);
    const title = selectedPdfFile.name.replace(/\.[^/.]+$/, "");

    // Common PDF Loader
    let pdf: any = null;
    try {
        const pdfjsLib = await import('pdfjs-dist');
        // UPDATED: Sync worker version with importmap (5.4.530) to avoid mismatch errors
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.530/build/pdf.worker.min.mjs';
        const arrayBuffer = await selectedPdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdf = await loadingTask.promise;
    } catch (e: any) {
        alert(`PDF 读取失败: ${e.message}`);
        setIsImporting(false);
        setImportStatus('');
        setImportProgress(0);
        return;
    }

    if (signal.aborted) return;

    if (mode === 'local') {
      setImportStatus('本地解析中...');
      try {
        let rawTextAccumulator = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          if (signal.aborted) throw new Error("AbortError");
          setImportStatus(`解析第 ${i} / ${pdf.numPages} 页`);
          setImportProgress(Math.round((i / pdf.numPages) * 90));
          
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Enhanced Page Text Extraction based on Y-coordinate
          const items = textContent.items;
          if (items.length === 0) continue;

          let pageStr = '';
          let lastY = -999;
          
          // PDF coordinates: (0,0) is usually bottom-left. 
          // items are usually returned in reading order (top-left to bottom-right).
          for (const item of items) {
             const text = item.str;
             // item.transform[5] is the translate Y component
             const y = item.transform ? item.transform[5] : 0;
             
             // If Y changed significantly (e.g., > 8 units), assume new line
             if (lastY !== -999 && Math.abs(y - lastY) > 8) {
                pageStr += '\n';
             } else if (pageStr.length > 0 && !pageStr.endsWith('\n')) {
                 // Same line, check if we need space
                 // Heuristic: If English, add space if needed. 
                 // (We will also do a global cleanup later, but basic spacing here helps)
                 const lastChar = pageStr[pageStr.length-1];
                 const isLastCJK = /[\u4e00-\u9fa5]/.test(lastChar);
                 const isCurrCJK = /[\u4e00-\u9fa5]/.test(text[0]);
                 
                 // If NOT CJK transition, add space
                 if (!isLastCJK && !isCurrCJK && text.trim().length > 0 && lastChar !== ' ') {
                    pageStr += ' ';
                 }
             }
             
             pageStr += text;
             lastY = y;
          }
          
          rawTextAccumulator += pageStr + '\n';
        }

        if (!rawTextAccumulator.trim()) throw new Error("未提取到文本 (可能是纯图片PDF)");

        setImportStatus('正在优化排版...');
        const optimizedText = optimizeExtractedText(rawTextAccumulator);
        onImport(title, optimizedText);

      } catch (err: any) {
        if (err.message === "AbortError" || err.name === "AbortError") {
             console.log("Import cancelled by user");
             return; // Silent return
        }
        console.error("Local Import Error:", err);
        alert(`本地解析失败: ${err.message}\n建议尝试使用 "AI 智能识别" 模式。`);
      } finally {
        if (!signal.aborted) {
           setIsImporting(false);
           setImportStatus('');
           setImportProgress(0);
           setSelectedPdfFile(null);
        }
      }
    } else {
      // --- AI IMPORT (GENERIC) ---
      setImportStatus('连接 AI 引擎...');
      setImportProgress(10);
      try {
        if (!engineConfig.apiKey) {
            throw new Error("请先在设置中配置 API Key。");
        }

        let extractedText = '';

        // Branch 1: Gemini (Native PDF Support - Best & Fastest)
        if (engineConfig.provider === 'gemini') {
            setImportStatus('上传 PDF 给 Gemini...');
            setImportProgress(50); // Fake progress for upload
            extractedText = await extractTextFromPDF(selectedPdfFile, engineConfig, signal);
            setImportProgress(100);
        } 
        // Branch 2: Other Providers (GPT-4o, Claude, DeepSeek, etc.)
        else {
            // Attempt 1: Vision (OCR) - Best for garbled text
            const modelName = (engineConfig.model || '').toLowerCase();
            const isLikelyTextOnly = modelName.includes('deepseek') && !modelName.includes('vl');
            
            if (!isLikelyTextOnly) {
                try {
                    setImportStatus('准备视觉识别...');
                    // Limit to first 20 pages for Vision to prevent timeout/token limits in this demo
                    const images = await renderPdfToImages(pdf, signal, 20); 
                    setImportStatus('AI 正在阅读图片...');
                    // Progress stays at 100% of preparation (rendering), now waiting for API
                    extractedText = await processImagesWithAI(images, engineConfig, signal);
                } catch (visionError: any) {
                     if (visionError.message === "AbortError" || visionError.name === "AbortError") throw visionError;
                    console.warn("Vision failed, falling back to Text Repair", visionError);
                }
            }

            // Attempt 2: Text Repair (Fallback)
            if (!extractedText && !signal.aborted) {
                setImportStatus('视觉识别不可用，尝试文本修复...');
                
                // Extract Raw Text (likely garbled)
                let rawText = '';
                const limit = Math.min(pdf.numPages, 30);
                for (let i = 1; i <= limit; i++) {
                    if (signal.aborted) throw new Error("AbortError");
                    setImportStatus(`提取文本: ${i}/${limit}`);
                    setImportProgress(Math.round((i / limit) * 100));
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    rawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
                }

                if (!rawText.trim()) throw new Error("无法提取文本，且 AI 视觉识别失败。");

                setImportStatus('AI 正在修复乱码...');
                extractedText = await repairTextWithAI(rawText, engineConfig, signal);
            }
        }
        
        if (signal.aborted) return;
        if (!extractedText) throw new Error("AI 未返回任何内容。");
        onImport(title, extractedText);

      } catch (err: any) {
        if (err.message === "AbortError" || err.name === "AbortError") {
             console.log("Import cancelled by user");
             return; 
        }
        console.error("AI Import Error:", err);
        alert(`AI 识别失败: ${err.message}\n\n提示: 如果使用 DeepSeek 等纯文本模型，请尝试切换到 Gemini 或 GPT-4o 以获得最佳的 PDF 识别效果。`);
      } finally {
        // Only clean up if we weren't aborted (abort handler does cleanup)
        // or if successful.
        if (!signal.aborted) {
            setIsImporting(false);
            setImportStatus('');
            setImportProgress(0);
            setSelectedPdfFile(null);
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50">
      
      {/* ABORT CONFIRMATION MODAL */}
      {showAbortConfirm && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fadeIn">
           <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center border border-stone-200">
               <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-4">
                  <i className="fa-solid fa-hand"></i>
               </div>
               <h3 className="text-lg font-bold text-stone-900 mb-2">中断导入？</h3>
               <p className="text-sm text-stone-500 mb-6">正在进行的 PDF 解析或上传将被终止。已处理的进度将丢失。</p>
               <div className="flex gap-3">
                  <button 
                    onClick={() => setShowAbortConfirm(false)}
                    className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-bold text-xs hover:bg-stone-50 transition-colors"
                  >
                    继续上传
                  </button>
                  <button 
                    onClick={handleCancelImport}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-xs hover:bg-red-600 transition-colors shadow-lg"
                  >
                    确认停止
                  </button>
               </div>
           </div>
        </div>
      )}

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
      <header className="px-8 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))] bg-white border-b border-stone-200">
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
                accept=".txt,.md,.pdf,.epub" 
                onChange={handleFileUpload}
                disabled={isImporting}
                className={`absolute inset-0 opacity-0 cursor-pointer z-20 ${isImporting ? 'pointer-events-none' : ''}`}
              />
              <button 
                onClick={(e) => {
                   if (isImporting) {
                      e.preventDefault();
                      e.stopPropagation(); // Stop the file input from opening
                      setShowAbortConfirm(true);
                   }
                }}
                className={`relative overflow-hidden px-6 py-3 bg-stone-900 text-white rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-stone-800 transition-all shadow-lg ${isImporting ? 'cursor-pointer pr-4 hover:bg-red-900/90' : ''}`}
              >
                
                {/* Progress Bar Background */}
                {isImporting && (
                   <div 
                     className="absolute left-0 top-0 bottom-0 bg-stone-700 transition-all duration-300 ease-out"
                     style={{ width: `${importProgress}%` }} 
                   />
                )}
                
                {/* Button Content */}
                <div className="relative z-10 flex items-center gap-2">
                  {isImporting ? (
                     <>
                        <i className="fa-solid fa-xmark text-amber-500 text-xs"></i>
                        <span className="tabular-nums text-xs font-mono text-amber-500">{importProgress}%</span>
                     </>
                  ) : (
                     <i className="fa-solid fa-plus"></i>
                  )}
                  <span>{isImporting ? (importStatus || '点击取消') : '导入书籍'}</span>
                </div>

                {/* Bottom Progress Line */}
                {isImporting && (
                   <div 
                     className="absolute left-0 bottom-0 h-1 bg-amber-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                     style={{ width: `${importProgress}%` }} 
                   />
                )}
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
              <p className="text-stone-400 max-w-xs mx-auto mt-2">导入你的第一本 TXT/PDF/EPUB 书籍，或开始写作。</p>
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
