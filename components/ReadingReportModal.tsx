
import React, { useState, useEffect } from 'react';
import { Book, Annotation, Persona, EngineConfig } from '../types';
import { generateSoulReport, generateLongFormAIReview, respondToUserBookReview } from '../services/geminiService';

interface ReadingReportModalProps {
  book: Book;
  annotations: Annotation[];
  persona: Persona;
  engineConfig: EngineConfig;
  onClose: () => void;
  onSaveReview: (rating: number, review: string, aiResponse?: string, aiLongReview?: string) => void;
}

// Updated Report Type
interface SoulReportData {
    summary: string;
    keywords: string[];
    sharedFocus: string;
    temporalInsight: string;
    emotionalPoint: string;
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

const ReadingReportModal: React.FC<ReadingReportModalProps> = ({ book, annotations, persona, engineConfig, onClose, onSaveReview }) => {
  const [report, setReport] = useState<SoulReportData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [userRating, setUserRating] = useState(book.rating || 0);
  const [userReview, setUserReview] = useState(book.userReview || '');
  const [aiLongReview, setAiLongReview] = useState(book.aiReview || '');
  const [aiResponseToReview, setAiResponseToReview] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isGeneratingAIReview, setIsGeneratingAIReview] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const data = await generateSoulReport(book.title, annotations, persona.name, engineConfig);
        setReport(data);

        // AUTO-GENERATE AI REVIEW if missing, regardless of autonomous setting
        if (!aiLongReview && !book.aiReview) {
          setIsGeneratingAIReview(true);
          const longReview = await generateLongFormAIReview(
              book.title, 
              book.content, 
              annotations, 
              persona, 
              engineConfig, 
              book.isOriginal
          );
          setAiLongReview(longReview);
          setIsGeneratingAIReview(false);
          // Auto-save the AI review to the book state via parent if needed, 
          // or just wait for user to submit their own review to save everything.
          // Since onSaveReview updates the book object, we might want to trigger it silently or just keep local state.
          // For now, keeping local state is fine, user will see it and can save it along with their review.
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [book, annotations, persona, engineConfig]);

  const handleReviewSubmit = async () => {
    if (!userRating || !userReview.trim()) return;
    setIsSubmittingReview(true);
    try {
      const response = await respondToUserBookReview(book.title, userReview, userRating, persona, engineConfig);
      setAiResponseToReview(response);
      onSaveReview(userRating, userReview, response, aiLongReview);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}小时 ${mins}分`;
    return `${mins}分 ${seconds % 60}秒`;
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-xl">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-stone-200 relative">
        <button onClick={onClose} className="absolute right-8 top-8 w-10 h-10 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-400 z-10">
          <i className="fa-solid fa-xmark"></i>
        </button>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-amber-100 border-t-amber-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Avatar avatar={persona.avatar} className="w-16 h-16 text-3xl" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-serif font-bold text-stone-900">正在生成心灵旅程...</h2>
              <p className="text-stone-400 mt-2 italic">{persona.name} 正在回溯书页与时光...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 space-y-12">
            <header className="text-center space-y-4">
              <div className="inline-block px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-[0.2em]">
                共读完成
              </div>
              <h1 className="text-4xl font-serif font-bold text-stone-900">{book.title}</h1>
              <p className="text-stone-500 font-serif italic">— 共读伙伴: {persona.name} —</p>
            </header>

            {/* Basic Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-stone-50 p-6 rounded-3xl text-center space-y-2">
                <div className="text-amber-500"><i className="fa-solid fa-hourglass-half"></i></div>
                <div className="text-xl font-bold text-stone-900">{formatDuration(book.timeSpent || 0)}</div>
                <div className="text-[10px] uppercase font-bold text-stone-400">共读时长</div>
              </div>
              <div className="bg-stone-50 p-6 rounded-3xl text-center space-y-2">
                <div className="text-blue-500"><i className="fa-solid fa-feather"></i></div>
                <div className="text-xl font-bold text-stone-900">{annotations.length}</div>
                <div className="text-[10px] uppercase font-bold text-stone-400">思想火花</div>
              </div>
            </div>

            {/* Summary Quote */}
            <section className="bg-amber-50/50 p-8 rounded-[2rem] border border-amber-100 relative overflow-hidden">
               <i className="fa-solid fa-quote-left absolute -left-2 -top-2 text-6xl text-amber-200/40 opacity-50" />
               <p className="relative z-10 text-lg font-serif italic text-stone-800 leading-relaxed text-center">
                 {report?.summary}
               </p>
            </section>

            {/* Deep Analysis Cards (New) */}
            <div className="space-y-4">
              <h3 className="text-center text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">心灵分析时间轴</h3>
              
              <div className="bg-purple-50/50 border border-purple-100 p-6 rounded-3xl flex items-start gap-4">
                 <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 mt-1">
                    <i className="fa-solid fa-moon"></i>
                 </div>
                 <div>
                    <h4 className="font-bold text-stone-900 text-sm mb-1">深夜回响 (时间洞察)</h4>
                    <p className="text-sm text-stone-600 italic leading-relaxed">"{report?.temporalInsight}"</p>
                 </div>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 p-6 rounded-3xl flex items-start gap-4">
                 <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-1">
                    <i className="fa-solid fa-heart-pulse"></i>
                 </div>
                 <div>
                    <h4 className="font-bold text-stone-900 text-sm mb-1">情感共振 (最大波峰)</h4>
                    <p className="text-sm text-stone-600 italic leading-relaxed">"{report?.emotionalPoint}"</p>
                 </div>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl flex items-start gap-4">
                 <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-1">
                    <i className="fa-solid fa-bullseye"></i>
                 </div>
                 <div>
                    <h4 className="font-bold text-stone-900 text-sm mb-1">共同焦点</h4>
                    <p className="text-sm text-stone-600 italic leading-relaxed">"{report?.sharedFocus}"</p>
                 </div>
              </div>
            </div>

            {/* AI Deep Review Section - Always Visible if generated */}
            <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-stone-100"></div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">{persona.name} 的深度书评</h3>
                  <div className="h-px flex-1 bg-stone-100"></div>
                </div>
                
                {isGeneratingAIReview ? (
                  <div className="p-12 text-center bg-stone-50 rounded-[2.5rem] animate-pulse flex flex-col items-center justify-center gap-4">
                    <i className="fa-solid fa-pen-nib text-stone-300 text-2xl animate-bounce"></i>
                    <p className="text-sm text-stone-400 italic">
                        正在撰写 800 字深度书评，其中包含了对你我共读时光的回忆...
                    </p>
                  </div>
                ) : aiLongReview ? (
                  <div className="bg-white border border-stone-100 p-8 rounded-[2.5rem] shadow-sm font-serif text-lg leading-relaxed text-stone-800 whitespace-pre-wrap">
                    <div className="text-3xl mb-4 opacity-50 select-none">❧</div>
                    {aiLongReview}
                    <div className="mt-8 pt-8 border-t border-stone-50 text-right italic text-stone-400 text-sm">
                      — {persona.name}
                    </div>
                  </div>
                ) : null}
            </section>

            <section className="bg-stone-50 p-10 rounded-[2.5rem] space-y-8">
               <div className="text-center">
                  <h3 className="text-lg font-bold text-stone-900">读者评价</h3>
                  <p className="text-xs text-stone-500 mt-1">回顾这段旅程并分享你的最终想法。</p>
               </div>

               <div className="flex justify-center gap-2">
                 {[1, 2, 3, 4, 5].map(star => (
                   <button 
                     key={star}
                     onClick={() => setUserRating(star)}
                     className={`text-3xl transition-all hover:scale-125 ${star <= userRating ? 'text-amber-500' : 'text-stone-300'}`}
                   >
                     <i className={`fa-solid fa-star`}></i>
                   </button>
                 ))}
               </div>

               <div className="space-y-4">
                 <textarea 
                   value={userReview}
                   onChange={(e) => setUserReview(e.target.value)}
                   placeholder="写下你的书评...这本书带给你怎样的触动？"
                   className="w-full bg-white border border-stone-200 rounded-3xl p-6 text-sm focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 min-h-[150px] resize-none shadow-sm transition-all"
                 />
                 
                 <button 
                   onClick={handleReviewSubmit}
                   disabled={isSubmittingReview || !userRating || !userReview.trim()}
                   className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                 >
                   {isSubmittingReview ? (
                     <i className="fa-solid fa-spinner animate-spin"></i>
                   ) : (
                     <i className="fa-solid fa-paper-plane"></i>
                   )}
                   发布书评并获取回应
                 </button>
               </div>

               {(aiResponseToReview || book.rating) && (
                 <div className="mt-8 p-6 bg-white border border-amber-100 rounded-2xl animate-fadeInUp">
                   <div className="flex items-center gap-2 mb-2">
                     <Avatar avatar={persona.avatar} className="w-8 h-8 text-sm" />
                     <span className="text-xs font-bold text-stone-900">{persona.name} 回应道:</span>
                   </div>
                   <p className="text-sm text-stone-700 italic leading-relaxed font-serif">
                     {aiResponseToReview || "我已经认真思考了你的想法，并将其存入了我们的共同记忆中。"}
                   </p>
                 </div>
               )}
            </section>

            <footer className="pt-8 border-t border-stone-100 text-center">
               <div className="flex justify-center mb-2">
                 <Avatar avatar={persona.avatar} className="w-12 h-12 text-2xl" />
               </div>
               <div className="text-sm text-stone-400 font-serif italic">"真理只存在于对话之中。" — {persona.name}</div>
               <div className="mt-8 flex gap-3">
                  <button onClick={() => window.print()} className="flex-1 py-3 border border-stone-200 text-stone-600 rounded-2xl font-bold text-sm hover:bg-stone-50 transition-all">
                    保存为 PDF
                  </button>
                  <button onClick={onClose} className="flex-[2] py-3 bg-stone-900 text-white rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all shadow-xl">
                    结束旅程
                  </button>
               </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingReportModal;
