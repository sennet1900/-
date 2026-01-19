
import React, { useState, useRef } from 'react';
import { Persona, Book, Annotation, EngineConfig } from '../types';
import { consolidateMemory } from '../services/geminiService';

interface PersonaModalProps {
  persona: Persona | null; 
  onSave: (persona: Persona) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  // NEW: props for memory consolidation
  activeBook?: Book | null;
  bookAnnotations?: Annotation[];
  engineConfig?: EngineConfig;
}

const PersonaModal: React.FC<PersonaModalProps> = ({ 
  persona, 
  onSave, 
  onClose, 
  onDelete,
  activeBook,
  bookAnnotations,
  engineConfig
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'memory'>('profile');
  const [formData, setFormData] = useState<Persona>({
    id: persona?.id || Date.now().toString(),
    name: persona?.name || '',
    role: persona?.role || '',
    relationship: persona?.relationship || 'Reading Companion',
    description: persona?.description || '',
    avatar: persona?.avatar || '👤',
    systemInstruction: persona?.systemInstruction || '',
    longTermMemory: persona?.longTermMemory || ''
  });

  const [isConsolidating, setIsConsolidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.systemInstruction) {
      onSave(formData);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB Limit
        alert("Image is too large. Please select an image under 1MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({...formData, avatar: reader.result as string});
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManualConsolidation = async () => {
    if (!activeBook || !bookAnnotations || !engineConfig) return;
    
    setIsConsolidating(true);
    try {
      const newMemory = await consolidateMemory(
        formData, 
        activeBook.title, 
        bookAnnotations, 
        engineConfig
      );
      setFormData(prev => ({ ...prev, longTermMemory: newMemory }));
    } catch (error) {
      console.error("Memory consolidation failed", error);
    } finally {
      setIsConsolidating(false);
    }
  };

  const renderAvatarPreview = () => {
    const isImage = formData.avatar.startsWith('data:');
    return (
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="w-20 h-20 rounded-3xl bg-stone-100 border-2 border-dashed border-stone-200 flex items-center justify-center cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-all overflow-hidden group relative"
      >
        {isImage ? (
          <img src={formData.avatar} className="w-full h-full object-cover" alt="Preview" />
        ) : (
          <span className="text-3xl">{formData.avatar}</span>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <i className="fa-solid fa-camera text-white"></i>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden border border-stone-100">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <h2 className="text-xl font-bold text-stone-900">{persona ? 'Edit Persona' : 'Create New Soul'}</h2>
            <p className="text-xs text-stone-500">Define the personality and memory of your companion.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full text-stone-400 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-100 bg-stone-50">
           <button 
             onClick={() => setActiveTab('profile')}
             className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'profile' ? 'text-amber-600 border-b-2 border-amber-600 bg-white' : 'text-stone-400 hover:text-stone-600'}`}
           >
             Profile & Voice
           </button>
           <button 
             onClick={() => setActiveTab('memory')}
             className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'memory' ? 'text-purple-600 border-b-2 border-purple-600 bg-white' : 'text-stone-400 hover:text-stone-600'}`}
           >
             Memory Core
           </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {activeTab === 'profile' ? (
            <>
              <div className="flex gap-6 items-center">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Visual Soul</label>
                  {renderAvatarPreview()}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    className="hidden" 
                    accept="image/*" 
                  />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Name</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                      placeholder="e.g. Albert Einstein"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Or Use Emoji Avatar</label>
                    <input 
                      type="text" 
                      value={formData.avatar.startsWith('data:') ? '' : formData.avatar}
                      onChange={e => setFormData({...formData, avatar: e.target.value || '👤'})}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl py-2 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 text-sm"
                      placeholder="Paste an emoji..."
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Role</label>
                  <input 
                    type="text" 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value})}
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Theoretical Physicist"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Relationship</label>
                  <input 
                    type="text" 
                    value={formData.relationship}
                    onChange={e => setFormData({...formData, relationship: e.target.value})}
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Soulmate, Mentor"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Short Bio</label>
                <textarea 
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="A brief summary of their life and outlook..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Inner Voice (System Instruction)</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.systemInstruction}
                  onChange={e => setFormData({...formData, systemInstruction: e.target.value})}
                  className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="Tell the AI how to behave..."
                />
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-fadeIn">
               <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <h4 className="text-sm font-bold text-purple-900 mb-1 flex items-center gap-2">
                     <i className="fa-solid fa-brain"></i> Long-Term Memory
                  </h4>
                  <p className="text-xs text-purple-700 leading-relaxed">
                     This text is automatically injected into the AI's mind at the start of every interaction. It allows the persona to remember your shared history across different books.
                  </p>
               </div>

               {activeBook && bookAnnotations && bookAnnotations.length > 5 ? (
                 <button
                   type="button"
                   onClick={handleManualConsolidation}
                   disabled={isConsolidating}
                   className="w-full py-4 bg-white border-2 border-dashed border-purple-200 rounded-2xl text-purple-600 font-bold text-xs uppercase tracking-wider hover:bg-purple-50 hover:border-purple-300 transition-all flex items-center justify-center gap-2"
                 >
                   {isConsolidating ? (
                     <><i className="fa-solid fa-spinner animate-spin"></i> Consolidating...</>
                   ) : (
                     <><i className="fa-solid fa-file-import"></i> Absorb Memories from "{activeBook.title}"</>
                   )}
                 </button>
               ) : (
                 <div className="text-center p-4 border-2 border-dashed border-stone-200 rounded-2xl text-xs text-stone-400">
                    Annotate more in a book to enable memory absorption.
                 </div>
               )}

               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Memory Storage</label>
                    <span className="text-[10px] text-stone-300">{formData.longTermMemory?.length || 0} chars</span>
                  </div>
                  <textarea 
                    rows={12}
                    value={formData.longTermMemory}
                    onChange={e => setFormData({...formData, longTermMemory: e.target.value})}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-purple-500/20 focus:outline-none focus:border-purple-500 resize-none text-sm font-mono text-stone-600"
                    placeholder="No memories yet. They will appear here..."
                  />
               </div>
            </div>
          )}
        </form>

        <div className="p-6 bg-stone-50 border-t border-stone-100 flex gap-3">
          {persona && onDelete && (
            <button 
              type="button"
              onClick={() => onDelete(persona.id)}
              className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
            >
              Delete
            </button>
          )}
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
            Save Soul
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonaModal;
