
import React, { useState, useMemo } from 'react';
import { Persona, Annotation, EngineConfig } from '../types';

interface SidebarProps {
  currentPersona: Persona;
  allPersonas: Persona[];
  onChangePersona: (p: Persona) => void;
  onOpenPersonaEditor: (p?: Persona) => void;
  annotations: Annotation[];
  onSelectAnnotation: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onBatchDeleteAnnotations?: (ids: string[]) => void; // New prop for batch delete
  activeAnnotationId: string | null;
  engineConfig: EngineConfig;
  progress: number;
  onOpenReport: () => void;
  onClose?: () => void;
  processingAnnotationIds?: Set<string>;
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
  onDeleteAnnotation,
  onBatchDeleteAnnotations,
  activeAnnotationId,
  engineConfig,
  progress,
  onOpenReport,
  onClose,
  processingAnnotationIds = new Set()
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'timeline'>('notes');
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  
  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter annotations for Timeline: Only show interactions where BOTH User and AI participated
  const timelineAnnotations = useMemo(() => {
    return annotations.filter(anno => {
      const history = anno.chatHistory || [];
      const hasUser = history.some(m => m.role === 'user');
      const hasModel = history.some(m => m.role === 'model');
      return hasUser && hasModel;
    });
  }, [annotations]);

  // Grouping logic based on the active tab's data source
  // For 'notes', we use all annotations. For 'timeline', we use the filtered ones.
  const sourceAnnotations = activeTab === 'timeline' ? timelineAnnotations : annotations;

  const groupedAnnotations = useMemo(() => {
    return sourceAnnotations.reduce((groups: Record<string, Annotation[]>, anno) => {
      const date = new Date(anno.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(anno);
      return groups;
    }, {});
  }, [sourceAnnotations]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedAnnotations).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [groupedAnnotations]);

  // Toggle date collapse state
  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  // --- Batch Mode Handlers ---

  const toggleBatchSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sourceAnnotations.length) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      // Select all visible in current tab
      setSelectedIds(new Set(sourceAnnotations.map(a => a.id)));
    }
  };

  const handleExecuteBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (onBatchDeleteAnnotations) {
      onBatchDeleteAnnotations(Array.from(selectedIds));
      setIsBatchMode(false);
      setSelectedIds(new Set());
    }
  };

  const toggleBatchMode = () => {
    setIsBatchMode(prev => !prev);
    setSelectedIds(new Set()); // Clear selection when toggling
  };

  // Determine which font to use for annotations (AI)
  const annotationFont = engineConfig.customNoteFontName || engineConfig.aiFont;

  return (
    <div className="w-full h-full flex flex-col bg-white/90 md:bg-white/50 backdrop-blur-md overflow-hidden relative">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">共读伙伴</h3>
          <div className="flex items-center gap-4">
            <button onClick={() => onOpenPersonaEditor(currentPersona)} className="text-[10px] text-amber-600 hover:underline font-bold">编辑</button>
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

      <div className="flex border-b border-stone-100 relative">
        <button onClick={() => setActiveTab('notes')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'notes' ? 'text-amber-600 bg-amber-50/50 border-b-2 border-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>
          <i className="fa-solid fa-feather-pointed"></i> 笔记 ({annotations.length})
        </button>
        <button onClick={() => setActiveTab('timeline')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'timeline' ? 'text-amber-600 bg-amber-50/50 border-b-2 border-amber-600' : 'text-stone-400 hover:text-stone-600'}`}>
          <i className="fa-solid fa-timeline"></i> 对话 ({timelineAnnotations.length})
        </button>
      </div>

      {/* Batch Action Bar */}
      {isBatchMode ? (
        <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between animate-slideDown">
           <button 
             onClick={handleSelectAll}
             className="text-xs font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1"
           >
             <i className={`fa-solid ${selectedIds.size === sourceAnnotations.length && sourceAnnotations.length > 0 ? 'fa-square-check' : 'fa-square'} text-amber-500`}></i>
             {selectedIds.size === sourceAnnotations.length && sourceAnnotations.length > 0 ? '取消全选' : '全选'}
           </button>
           
           <div className="flex items-center gap-3">
             <button 
               onClick={toggleBatchMode}
               className="text-xs font-bold text-stone-400 hover:text-stone-600"
             >
               取消
             </button>
             <button 
               onClick={handleExecuteBatchDelete}
               disabled={selectedIds.size === 0}
               className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
               删除 ({selectedIds.size})
             </button>
           </div>
        </div>
      ) : (
        <div className="px-4 py-2 border-b border-stone-50 flex justify-end bg-white">
           <button 
             onClick={toggleBatchMode}
             className="text-[10px] font-bold text-stone-400 hover:text-stone-800 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-stone-50"
             title="批量管理"
           >
             <i className="fa-solid fa-list-check"></i> 批量管理
           </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'notes' ? (
          <div className="space-y-4">
            {annotations.length === 0 ? (
              <div className="text-center py-10 px-4">
                <i className="fa-solid fa-feather text-stone-200 text-3xl mb-2"></i>
                <p className="text-sm text-stone-400 italic">暂无笔记。</p>
              </div>
            ) : (
              annotations.map(anno => (
                <div 
                  key={anno.id} 
                  onClick={() => {
                    if (isBatchMode) {
                      toggleBatchSelection(anno.id);
                    } else {
                      onSelectAnnotation(anno.id);
                    }
                  }} 
                  className={`p-3 rounded-xl cursor-pointer transition-all border relative group flex gap-3
                    ${activeAnnotationId === anno.id && !isBatchMode ? 'bg-amber-50 border-amber-200 shadow-sm ring-1 ring-amber-100' : anno.isAutonomous ? 'bg-purple-50/30 border-purple-100 hover:border-purple-200' : 'bg-white border-stone-100 hover:border-stone-200'} 
                    ${anno.author === 'user' ? 'border-l-4 border-l-amber-500' : ''}`}
                >
                  {isBatchMode && (
                    <div className="flex items-center justify-center shrink-0">
                       <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedIds.has(anno.id) ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'}`}>
                          {selectedIds.has(anno.id) && <i className="fa-solid fa-check text-xs"></i>}
                       </div>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                       <div className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <i className="fa-regular fa-clock text-[8px]"></i>
                          {new Date(anno.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </div>
                       <div className="flex items-center gap-2">
                         {/* Processing Indicator */}
                         {processingAnnotationIds.has(anno.id) && (
                           <div className="text-[9px] font-bold text-amber-600 flex items-center gap-1 animate-pulse">
                              <i className="fa-solid fa-spinner animate-spin"></i> 思考中
                           </div>
                         )}
                         {anno.isAutonomous && <div className="text-[9px] font-bold text-purple-600 flex items-center gap-1 bg-purple-100 px-1 rounded"><i className="fa-solid fa-ghost text-[8px]"></i>自动</div>}
                         {anno.topic && <span className="text-[9px] text-stone-400 truncate max-w-[80px] text-right font-medium">{anno.topic}</span>}
                       </div>
                    </div>
                    
                    {/* Delete Button (Only active when NOT in batch mode) */}
                    {!isBatchMode && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(anno.id); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="删除批注"
                        >
                          <i className="fa-solid fa-trash text-[10px]"></i>
                        </button>
                      </div>
                    )}

                    <div className="text-[10px] text-stone-400 mb-1 italic truncate">"{anno.textSelection}"</div>
                    <div className="text-sm text-stone-800 line-clamp-2 leading-relaxed" style={{ fontFamily: anno.author === 'user' ? engineConfig.userFont : annotationFont }}>{anno.comment}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-8 py-2">
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-stone-100 rounded-full" />
            {timelineAnnotations.length === 0 && <div className="text-center py-10 px-4 ml-[-24px]"><p className="text-xs text-stone-400 italic">暂无深入互动的对话。</p></div>}
            
            {sortedDates.map(date => {
              const isCollapsed = collapsedDates.has(date);
              return (
                <div key={date} className="space-y-4">
                  <div 
                    onClick={() => toggleDateCollapse(date)}
                    className="relative cursor-pointer group select-none"
                  >
                    <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-stone-200 group-hover:border-amber-400 flex items-center justify-center z-10 transition-colors">
                      <div className={`w-1.5 h-1.5 rounded-full bg-stone-300 group-hover:bg-amber-400 transition-colors ${isCollapsed ? 'bg-amber-400' : ''}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-stone-400 bg-stone-50 px-2 py-0.5 rounded border border-stone-100 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">{date}</span>
                      <i className={`fa-solid fa-chevron-down text-[10px] text-stone-300 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}></i>
                    </div>
                  </div>
                  
                  {/* Collapsible Content */}
                  <div className={`space-y-6 transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}>
                    {groupedAnnotations[date].map(anno => (
                      <div 
                        key={anno.id} 
                        onClick={() => {
                          if (isBatchMode) {
                            toggleBatchSelection(anno.id);
                          } else {
                            onSelectAnnotation(anno.id);
                          }
                        }}
                        className={`relative group cursor-pointer transition-all ${activeAnnotationId === anno.id && !isBatchMode ? 'scale-105' : 'hover:scale-102'} flex items-start gap-3`}
                      >
                         {/* Selection Checkbox for Timeline */}
                         {isBatchMode && (
                           <div className="flex items-center justify-center shrink-0 mt-2 z-20">
                             <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${selectedIds.has(anno.id) ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'}`}>
                               {selectedIds.has(anno.id) && <i className="fa-solid fa-check text-[8px]"></i>}
                             </div>
                           </div>
                         )}

                        <div className="relative flex-1">
                          <div className={`absolute left-[-23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 transition-all z-10 flex items-center justify-center overflow-hidden ${activeAnnotationId === anno.id && !isBatchMode ? 'bg-amber-500 border-amber-200 ring-4 ring-amber-100' : anno.isAutonomous ? 'bg-purple-400 border-purple-200' : anno.author === 'ai' ? 'bg-amber-100 border-amber-300 group-hover:bg-amber-200' : 'bg-stone-200 border-stone-300'}`}>
                            {processingAnnotationIds.has(anno.id) ? (
                              <div className="w-full h-full bg-amber-500 animate-pulse" />
                            ) : (
                              <Avatar avatar={currentPersona.avatar} className="w-full h-full text-[8px]" />
                            )}
                          </div>
                          <div className={`p-3 rounded-xl border transition-all ${activeAnnotationId === anno.id && !isBatchMode ? 'bg-amber-50 border-amber-200 shadow-sm' : 'bg-white border-stone-100 hover:border-stone-200'}`}>
                            <div className="text-[9px] text-stone-400 mb-1 flex items-center justify-between">
                              <span>{new Date(anno.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <div className="flex items-center gap-1 px-1 rounded text-amber-600 bg-amber-50">
                                <i className="fa-solid fa-comments text-[8px]"></i>
                                <span>深度共读</span>
                              </div>
                            </div>
                            
                            {!isBatchMode && (
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(anno.id); }}
                                  className="w-5 h-5 flex items-center justify-center rounded-full bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                  title="删除"
                                >
                                  <i className="fa-solid fa-trash text-[8px]"></i>
                                </button>
                              </div>
                            )}

                            <div className="text-xs font-serif font-bold text-stone-800 mb-1 leading-tight flex items-center gap-2">{anno.topic || 'Idea'}<i className="fa-solid fa-link text-[8px] text-amber-400"></i></div>
                            <div className="text-[10px] text-stone-500 italic line-clamp-1">"{anno.textSelection}"</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Trigger */}
      {progress >= 100 && !isBatchMode && (
        <div className="p-4 border-t border-stone-100 bg-stone-50">
          <button 
            onClick={onOpenReport}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-stone-800 transition-all flex items-center justify-center gap-2 overflow-hidden relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            <i className="fa-solid fa-scroll text-amber-400"></i>
            生成心灵共读报告
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
