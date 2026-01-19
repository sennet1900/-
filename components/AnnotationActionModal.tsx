
import React, { useState } from 'react';

interface AnnotationActionModalProps {
  selection: string;
  onAIAnnotate: () => void;
  onUserAnnotate: (note: string) => void;
  onClose: () => void;
  initialMode?: 'choice' | 'input';
}

const AnnotationActionModal: React.FC<AnnotationActionModalProps> = ({ selection, onAIAnnotate, onUserAnnotate, onClose, initialMode = 'choice' }) => {
  const [mode, setMode] = useState<'choice' | 'input'>(initialMode);
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-stone-100">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-stone-900">Add Marginalia</h3>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><i className="fa-solid fa-xmark"></i></button>
          </div>
          <p className="text-xs text-stone-500 italic line-clamp-2">"{selection}"</p>
        </div>

        <div className="p-6">
          {mode === 'choice' ? (
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => setMode('input')}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-100 hover:border-amber-500 hover:bg-amber-50 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <i className="fa-solid fa-pen-nib"></i>
                </div>
                <div>
                  <div className="font-bold text-sm text-stone-900">Write your own note</div>
                  <div className="text-[10px] text-stone-500">Share your thoughts first.</div>
                </div>
              </button>

              <button 
                onClick={onAIAnnotate}
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-stone-100 hover:border-amber-500 hover:bg-amber-50 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center">
                  <i className="fa-solid fa-sparkles"></i>
                </div>
                <div>
                  <div className="font-bold text-sm text-stone-900">Ask AI to annotate</div>
                  <div className="text-[10px] text-stone-500">Get an immediate insight from your partner.</div>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <textarea 
                autoFocus
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What are your thoughts on this passage?"
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 min-h-[120px] resize-none"
              />
              <div className="flex gap-2">
                {initialMode === 'choice' && (
                  <button 
                    onClick={() => setMode('choice')}
                    className="flex-1 py-2 text-stone-500 hover:bg-stone-100 rounded-xl text-xs font-bold transition-colors"
                  >
                    Back
                  </button>
                )}
                <button 
                  disabled={!note.trim()}
                  onClick={() => onUserAnnotate(note)}
                  className="flex-[2] py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Save & Ask AI
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnotationActionModal;
