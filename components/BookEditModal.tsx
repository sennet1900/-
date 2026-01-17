
import React, { useState } from 'react';
import { Book } from '../types';

interface BookEditModalProps {
  book: Book;
  onSave: (book: Book) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const PRESET_CATEGORIES = ['Philosophy', 'Fiction', 'Science', 'History', 'Technology', 'Poetry', 'Drama'];

const BookEditModal: React.FC<BookEditModalProps> = ({ book, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState<Book>({ ...book });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title) {
      onSave(formData);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden border border-stone-100">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Book Details</h2>
            <p className="text-xs text-stone-500">Organize your personal library.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full text-stone-400 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Book Title</label>
            <input 
              type="text" 
              required
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
              placeholder="e.g. The Republic"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Author</label>
            <input 
              type="text" 
              value={formData.author || ''}
              onChange={e => setFormData({...formData, author: e.target.value})}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
              placeholder="e.g. Plato"
            />
          </div>

          <div className="space-y-4">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setFormData({...formData, category: cat})}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    formData.category === cat 
                    ? 'bg-amber-500 border-amber-600 text-white' 
                    : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input 
              type="text" 
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
              placeholder="Or enter custom category..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-2">
             <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Theme Color</label>
             <div className="flex gap-3">
               {['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#78350f'].map(color => (
                 <button
                   key={color}
                   type="button"
                   onClick={() => setFormData({...formData, coverColor: color})}
                   className={`w-8 h-8 rounded-full border-2 transition-all ${formData.coverColor === color ? 'border-stone-900 scale-110' : 'border-transparent'}`}
                   style={{ backgroundColor: color }}
                 />
               ))}
             </div>
          </div>
        </form>

        <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
          <button 
            type="button"
            onClick={() => onDelete(book.id)}
            className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
          >
            Remove from Library
          </button>
          <div className="flex-1" />
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-stone-500 hover:bg-stone-200 rounded-xl transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors shadow-lg text-sm font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookEditModal;
