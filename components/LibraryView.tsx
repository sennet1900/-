
import React, { useState, useMemo } from 'react';
import { Book, Annotation } from '../types';

interface LibraryViewProps {
  library: Book[];
  annotations: Annotation[];
  onSelectBook: (id: string) => void;
  onImport: (title: string, content: string, author?: string) => void;
  onOpenWritingStudio: () => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({ 
  library, 
  annotations, 
  onSelectBook, 
  onImport, 
  onOpenWritingStudio,
  onEditBook,
  onDeleteBook 
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const categories = useMemo(() => {
    const cats = new Set(library.map(b => b.category));
    return ['All', ...Array.from(cats)];
  }, [library]);

  const filteredLibrary = useMemo(() => {
    return library.filter(book => {
      const matchesCategory = filterCategory === 'All' || book.category === filterCategory;
      const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (book.author?.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [library, filterCategory, searchQuery]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const title = file.name.replace(/\.[^/.]+$/, "");

    try {
      if (file.type === 'application/pdf') {
        // Dynamic import to keep initial bundle size small
        const pdfjsLib = await import('pdfjs-dist');
        // Set worker source to the same CDN version
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        // Iterate pages
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Simple join. For better formatting, one might analyze 'transform' items, but this suffices for a reader.
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          
          // Add double newline to separate pages naturally in the reader
          fullText += pageText + '\n\n';
        }

        onImport(title, fullText);

      } else {
        // Regular Text/Markdown parsing
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          onImport(title, content);
          setIsImporting(false);
        };
        reader.onerror = () => setIsImporting(false);
        reader.readAsText(file);
        return; // Return early as reader is async but handled by callback
      }
    } catch (err) {
      console.error("File Import Error:", err);
      alert("Failed to read file. If this is a PDF, ensure it contains selectable text.");
    } finally {
      // For PDF flow (await based), stop loading here. For text flow, it's handled in callback.
      if (file.type === 'application/pdf') {
        setIsImporting(false);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-50">
      {/* Header */}
      <header className="px-8 py-10 bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-serif font-bold text-stone-900 tracking-tight">SoulReader Library</h1>
            <p className="text-stone-500 mt-2">Pick up where you left off or explore new perspectives.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={onOpenWritingStudio}
              className="px-6 py-3 bg-white border border-stone-200 text-stone-700 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-stone-50 transition-all shadow-sm"
            >
              <i className="fa-solid fa-feather-pointed text-amber-600"></i>
              <span>Writing Studio</span>
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
                <span>{isImporting ? 'Parsing...' : 'Import Book'}</span>
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
              placeholder="Search title or author..."
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
              <h3 className="text-xl font-bold text-stone-800">No books found</h3>
              <p className="text-stone-400 max-w-xs mx-auto mt-2">Import your first text/PDF file or start writing to begin your collaborative reading journey.</p>
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
                            {bookAnnos} Annotations
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
