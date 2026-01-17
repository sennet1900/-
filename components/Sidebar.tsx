
import React, { useState } from 'react';
import { Persona, Annotation, EngineConfig } from '../types';

interface SidebarProps {
  currentPersona: Persona;
  allPersonas: Persona[];
  onChangePersona: (p: Persona) => void;
  onOpenPersonaEditor: (p?: Persona) => void;
  annotations: Annotation[];
  onSelectAnnotation: (id: string) => void;
  activeAnnotationId: string | null;
  engineConfig: EngineConfig;
  progress: number;
  onOpenReport: () => void;
  onClose?: () => void; // New prop for mobile closing
}

const Avatar: React.FC<{ avatar: string; className?: string }> = ({ avatar, className = "w-10 h-10" }) => {
  const isImage = avatar.startsWith('data:');
  return (
    <div className={`${className} flex items-center justify-center rounded-full overflow-hidden shrink-0`}>
      {isImage ? (
        <img src={avatar} className="w-full h-full object-cover" alt="Avatar" />
      ) : (
        <span>{avatar}</span>
      )}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  currentPersona,
  allPersonas,
  onChangePersona,
  onOpenPersonaEditor,
  annotations,
  onSelectAnnotation,
  activeAnnotationId,
  engineConfig,
  progress,
  onOpenReport,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'timeline'>('notes');

  const groupedAnnotations = annotations.reduce((groups: Record<string, Annotation[]>, anno) => {
    const date = new Date(anno.timestamp).toLocaleDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(anno);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedAnnotations).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Determine which font to use for annotations (AI)
  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  return (
    <div className="w-full h-full flex flex-col bg-white/90 md:bg-white/50 backdrop-blur-md overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Reading Partner</h3>
          <div className="flex items-center gap-4">
            <button onClick={() => onOpenPersonaEditor(currentPersona)} className="text-[10px] text-amber-600 hover:underline font-bold">EDIT</button>
            {/* Mobile Close Button */}
            <button onClick={onClose} className="md:hidden text-stone-400 hover:text-stone-900">
               <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-white border border-stone-100 shadow-sm rounded-xl">
          <Avatar avatar={currentPersona.avatar} className="w-12 h-12 text-3xl" />
          <div className="overflow-hidden">
            <div className="font-bold text-stone-900 truncate">{currentPersona.name}</div>
            <div className="text-xs text-stone-500 truncate">{currentPersona.role}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {allPersonas.map(p => (
            <button 
              key={p.id} 
              onClick={() => onChangePersona(p)} 
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all overflow-hidden ${currentPersona.id === p.id ? 'border-amber-500 bg-amber-50 scale-110' : 'border-stone-100 bg-white opacity-60 hover:opacity-100'}`} 
              title={p.name}
            >
              <Avatar avatar={p.avatar} className="w-full h-full text-xl" />
            </button>
          ))}
          <button onClick={() => onOpenPersonaEditor()} className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 border-dashed border-stone-300 text-stone-400 hover:border-amber-500 hover:text-amber-500 transition-all" title="Create Custom Persona">
            <i className="fa-solid fa-plus text-sm"></i>
          </button>
        </div>
      </div>

      <div className="flex border-b border-stone-100">
        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'notes' ? 'text-amber-600 bg-amber-50/50 border-b-2 border-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>
          <i className="fa-solid fa-feather-pointed"></i> Notes
        </button>
        <button onClick={() => setActiveTab('timeline')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'timeline' ? 'text-amber-600 bg-amber-50/50 border-b-2 border-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>
          <i className="fa-solid fa-timeline"></i> Timeline
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'notes' ? (
          <div className="space-y-4">
            {annotations.length === 0 ? (
              <div className="text-center py-10 px-4">
                <i className="fa-solid fa-feather text-stone-200 text-3xl mb-2"></i>
                <p className="text-sm text-stone-400 italic">No notes yet.</p>
              </div>
            ) : (
              annotations.map(anno => (
                <div key={anno.id} onClick={() => onSelectAnnotation(anno.id)} className={`p-3 rounded-xl cursor-pointer transition-all border relative ${activeAnnotationId === anno.id ? 'bg-amber-50 border-amber-200 shadow-sm ring-1 ring-amber-100' : anno.isAutonomous ? 'bg-purple-50/30 border-purple-100 hover:border-purple-200' : 'bg-white border-stone-100 hover:border-stone-200'} ${anno.author === 'user' ? 'border-l-4 border-l-amber-500' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                     <div className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <i className="fa-regular fa-clock text-[8px]"></i>
                        {new Date(anno.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </div>
                     {anno.isAutonomous && <div className="text-[9px] font-bold text-purple-600 flex items-center gap-1 bg-purple-100 px-1 rounded"><i className="fa-solid fa-ghost text-[8px]"></i>Auto</div>}
                     {anno.topic && <span className="text-[9px] text-stone-400 truncate max-w-[80px] text-right font-medium">{anno.topic}</span>}
                  </div>
                  <div className="text-[10px] text-stone-400 mb-1 italic truncate">"{anno.textSelection}"</div>
                  <div className="text-sm text-stone-800 line-clamp-2 leading-relaxed" style={{ fontFamily: anno.author === 'user' ? engineConfig.userFont : annotationFont }}>{anno.comment}</div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-8 py-2">
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-stone-100 rounded-full" />
            {annotations.length === 0 && <div className="text-center py-10 px-4 ml-[-24px]"><p className="text-xs text-stone-400">Empty.</p></div>}
            {sortedDates.map(date => (
              <div key={date} className="space-y-6">
                <div className="relative">
                  <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-stone-200 flex items-center justify-center z-10"><div className="w-1.5 h-1.5 rounded-full bg-stone-300" /></div>
                  <span className="text-[10px] font-bold text-stone-400 bg-stone-50 px-2 py-0.5 rounded border border-stone-100">{date}</span>
                </div>
                {groupedAnnotations[date].map(anno => (
                  <div key={anno.id} onClick={() => onSelectAnnotation(anno.id)} className={`relative group cursor-pointer transition-all ${activeAnnotationId === anno.id ? 'scale-105' : 'hover:scale-102'}`}>
                    <div className={`absolute left-[-23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 transition-all z-10 flex items-center justify-center overflow-hidden ${activeAnnotationId === anno.id ? 'bg-amber-500 border-amber-200 ring-4 ring-amber-100' : anno.isAutonomous ? 'bg-purple-400 border-purple-200' : anno.author === 'ai' ? 'bg-amber-100 border-amber-300 group-hover:bg-amber-200' : 'bg-stone-200 border-stone-300'}`}>
                      {anno.author === 'ai' && !anno.isAutonomous && <Avatar avatar={currentPersona.avatar} className="w-full h-full text-[8px]" />}
                    </div>
                    <div className={`p-3 rounded-xl border transition-all ${activeAnnotationId === anno.id ? 'bg-amber-50 border-amber-200 shadow-sm' : anno.isAutonomous ? 'bg-purple-50/20 border-purple-100' : 'bg-white border-stone-100 hover:border-stone-200'}`}>
                      <div className="text-[9px] text-stone-400 mb-1 flex items-center justify-between">
                        <span>{new Date(anno.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className={`flex items-center gap-1 px-1 rounded ${anno.author === 'ai' ? 'text-amber-600 bg-amber-50' : 'text-stone-500 bg-stone-50'}`}>
                           {anno.author === 'ai' ? <Avatar avatar={currentPersona.avatar} className="w-3 h-3 text-[8px]" /> : <i className="fa-solid fa-user text-[8px]"></i>}
                           <span>{anno.author === 'ai' ? currentPersona.name : 'Author'}</span>
                        </div>
                      </div>
                      <div className="text-xs font-serif font-bold text-stone-800 mb-1 leading-tight flex items-center gap-2">{anno.topic || 'Dialogue Node'}{anno.isAutonomous && <i className="fa-solid fa-ghost text-[8px] text-purple-400"></i>}</div>
                      <div className="text-[10px] text-stone-500 italic line-clamp-1">"{anno.textSelection}"</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report Trigger */}
      {progress >= 100 && (
        <div className="p-4 border-t border-stone-100 bg-stone-50">
          <button 
            onClick={onOpenReport}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-stone-800 transition-all flex items-center justify-center gap-2 overflow-hidden relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <i className="fa-solid fa-scroll text-amber-400"></i>
            Soul Reading Report
          </button>
        </div>
      )}

      <style>{`
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        .scale-102 { transform: scale(1.02); }
      `}</style>
    </div>
  );
};

export default Sidebar;
