
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
    relationship: persona?.relationship || '共读伙伴',
    userIdentity: persona?.userIdentity || '', // Default empty means "Reader"
    userAvatar: persona?.userAvatar || '👤', // Default user avatar
    description: persona?.description || '',
    avatar: persona?.avatar || '👤',
    systemInstruction: persona?.systemInstruction || '',
    longTermMemory: persona?.longTermMemory || ''
  });

  const [isConsolidating, setIsConsolidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.systemInstruction) {
      onSave(formData);
    }
  };

  // Image Compression Utility
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 200; // Resize to max 200px
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress to JPEG 0.7 quality
            resolve(canvas.toDataURL('image/jpeg', 0.7)); 
          } else {
             resolve(e.target?.result as string); // Fallback
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { 
        alert("图片过大，请选择 5MB 以下的图片。");
        return;
      }
      try {
        const compressed = await compressImage(file);
        setFormData({...formData, avatar: compressed});
      } catch (err) {
        console.error("Image compression failed", err);
      }
    }
  };

  const handleUserImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
       if (file.size > 5 * 1024 * 1024) { 
        alert("图片过大，请选择 5MB 以下的图片。");
        return;
      }
      try {
        const compressed = await compressImage(file);
        setFormData({...formData, userAvatar: compressed});
      } catch (err) {
        console.error("Image compression failed", err);
      }
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

  const renderAvatarPreview = (src: string, onClick: () => void, isUser: boolean = false) => {
    const safeSrc = src || '👤';
    const isImage = safeSrc.startsWith('data:');
    return (
      <div 
        onClick={onClick}
        className={`rounded-3xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden group relative bg-white
          ${isUser ? 'w-16 h-16 border-amber-200 hover:border-amber-400' : 'w-20 h-20 border-stone-200 bg-stone-100 hover:border-amber-500 hover:bg-amber-50'}
        `}
      >
        {isImage ? (
          <img src={safeSrc} className="w-full h-full object-cover" alt="Preview" />
        ) : (
          <span className={isUser ? "text-2xl" : "text-3xl"}>{safeSrc}</span>
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
            <h2 className="text-xl font-bold text-stone-900">{persona ? '编辑人格' : '创造新灵魂'}</h2>
            <p className="text-xs text-stone-500">定义共读伙伴的性格与记忆。</p>
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
             基础设定
           </button>
           <button 
             onClick={() => setActiveTab('memory')}
             className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'memory' ? 'text-purple-600 border-b-2 border-purple-600 bg-white' : 'text-stone-400 hover:text-stone-600'}`}
           >
             记忆核心
           </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {activeTab === 'profile' ? (
            <>
              <div className="flex gap-6 items-center">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">形象设定</label>
                  {renderAvatarPreview(formData.avatar, () => fileInputRef.current?.click())}
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
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">名字</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                      placeholder="例如: 爱因斯坦"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">或使用 Emoji 头像</label>
                    <input 
                      type="text" 
                      value={formData.avatar.startsWith('data:') ? '' : formData.avatar}
                      onChange={e => setFormData({...formData, avatar: e.target.value || '👤'})}
                      className="w-full bg-stone-100 border border-stone-200 rounded-xl py-2 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 text-sm"
                      placeholder="粘贴一个 emoji..."
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
                 <div className="text-xs font-bold text-amber-700 uppercase flex items-center gap-2">
                   <i className="fa-solid fa-user-tag"></i> 你的设定 (User Profile)
                 </div>
                 
                 <div className="flex gap-4 items-start">
                    {/* User Avatar Upload */}
                    <div className="space-y-2 flex flex-col items-center">
                       {renderAvatarPreview(formData.userAvatar || '👤', () => userFileInputRef.current?.click(), true)}
                       <span className="text-[10px] text-amber-600/60 font-bold uppercase">你的头像</span>
                       <input 
                        type="file" 
                        ref={userFileInputRef} 
                        onChange={handleUserImageUpload} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>

                    <div className="space-y-2 flex-1">
                      <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">你在 AI 眼中是谁？</label>
                      <input 
                        type="text" 
                        value={formData.userIdentity}
                        onChange={e => setFormData({...formData, userIdentity: e.target.value})}
                        className="w-full bg-white border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                        placeholder="例如: 你的学生、一个傲慢的评论家..."
                      />
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        AI 会根据你的身份调整回复深度。例如：对“小白”会通俗解释，对“专家”会进行辩论。
                      </p>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">AI 身份/角色</label>
                  <input 
                    type="text" 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value})}
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                    placeholder="例如: 理论物理学家"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">关系</label>
                  <input 
                    type="text" 
                    value={formData.relationship}
                    onChange={e => setFormData({...formData, relationship: e.target.value})}
                    className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500"
                    placeholder="例如: 导师, 灵魂伴侣"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">AI 简介</label>
                <textarea 
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="简要描述他/她的生平和性格..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">AI 内心设定 (系统指令)</label>
                <textarea 
                  required
                  rows={4}
                  value={formData.systemInstruction}
                  onChange={e => setFormData({...formData, systemInstruction: e.target.value})}
                  className="w-full bg-stone-100 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-amber-500/20 focus:outline-none focus:border-amber-500 resize-none text-sm"
                  placeholder="告诉 AI 应该如何表现..."
                />
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-fadeIn">
               <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <h4 className="text-sm font-bold text-purple-900 mb-1 flex items-center gap-2">
                     <i className="fa-solid fa-brain"></i> 长期记忆 (Long-Term Memory)
                  </h4>
                  <p className="text-xs text-purple-700 leading-relaxed">
                     这段文本会在每次对话开始时注入 AI 的思维。它允许角色记住你们跨越不同书籍的共同经历。
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
                     <><i className="fa-solid fa-spinner animate-spin"></i> 正在整合...</>
                   ) : (
                     <><i className="fa-solid fa-file-import"></i> 吸收《{activeBook.title}》的记忆</>
                   )}
                 </button>
               ) : (
                 <div className="text-center p-4 border-2 border-dashed border-stone-200 rounded-2xl text-xs text-stone-400">
                    在书中添加更多批注以启用记忆吸收功能。
                 </div>
               )}

               <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">记忆存储</label>
                    <span className="text-[10px] text-stone-300">{formData.longTermMemory?.length || 0} 字符</span>
                  </div>
                  <textarea 
                    rows={12}
                    value={formData.longTermMemory}
                    onChange={e => setFormData({...formData, longTermMemory: e.target.value})}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-purple-500/20 focus:outline-none focus:border-purple-500 resize-none text-sm font-mono text-stone-600"
                    placeholder="暂无记忆。它们将显示在这里..."
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
              删除
            </button>
          )}
          <div className="flex-1" />
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-stone-500 hover:bg-stone-200 rounded-xl transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors shadow-lg text-sm font-medium"
          >
            保存设定
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonaModal;
