
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
  const [report, setReport] = useState<{ summary: string; keywords: string[]; highlightTopics: string[] } | null>(null);
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

        if (engineConfig.autonomousReading && !book.aiReview) {
          setIsGeneratingAIReview(true);
          const longReview = await generateLongFormAIReview(book.title, book.content, annotations, persona, engineConfig, book.isOriginal);
          setAiLongReview(longReview);
          setIsGeneratingAIReview(false);
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
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${seconds % 60}s`;
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
              <h2 className="text-2xl font-serif font-bold text-stone-900">Synthesizing Your Soul Journey</h2>
              <p className="text-stone-400 mt-2 italic">{persona.name} is looking back through the pages...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-12 space-y-12">
            <header className="text-center space-y-4">
              <div className="inline-block px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-[0.2em]">
                Soul Reading Complete
              </div>
              <h1 className="text-4xl font-serif font-bold text-stone-900">{book.title}</h1>
              <p className="text-stone-500 font-serif italic">— Reading Partner: {persona.name} —</p>
            </header>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-stone-50 p-6 rounded-3xl text-center space-y-2">
                <div className="text-amber-500"><i className="fa-solid fa-hourglass-half"></i></div>
                <div className="text-xl font-bold text-stone-900">{formatDuration(book.timeSpent || 0)}</div>
                <div className="text-[10px] uppercase font-bold text-stone-400">Dialogue Time</div>
              </div>
              <div className="bg-stone-50 p-6 rounded-3xl text-center space-y-2">
                <div className="text-blue-500"><i className="fa-solid fa-feather"></i></div>
                <div className="text-xl font-bold text-stone-900">{annotations.length}</div>
                <div className="text-[10px] uppercase font-bold text-stone-400">Total Notes</div>
              </div>
              <div className="bg-stone-50 p-6 rounded-3xl text-center space-y-2">
                <div className="text-purple-500"><i className="fa-solid fa-ghost"></i></div>
                <div className="text-xl font-bold text-stone-900">{annotations.filter(a => a.isAutonomous).length}</div>
                <div className="text-[10px] uppercase font-bold text-stone-400">AI Sparks</div>
              </div>
            </div>

            <section className="bg-amber-50/50 p-8 rounded-[2rem] border border-amber-100 relative overflow-hidden">
               <i className="fa-solid fa-quote-left absolute -left-2 -top-2 text-6xl text-amber-200/40 opacity-50" />
               <p className="relative z-10 text-lg font-serif italic text-stone-800 leading-relaxed text-center">
                 {report?.summary}
               </p>
            </section>

            {engineConfig.autonomousReading && (
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-stone-100"></div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">{persona.name}'s Deep Review</h3>
                  <div className="h-px flex-1 bg-stone-100"></div>
                </div>
                
                {isGeneratingAIReview ? (
                  <div className="p-8 text-center bg-stone-50 rounded-3xl animate-pulse">
                    <p className="text-sm text-stone-400 italic">Writing a literary critique of our journey...</p>
                  </div>
                ) : (
                  <div className="bg-white border border-stone-100 p-8 rounded-[2.5rem] shadow-sm font-serif text-lg leading-relaxed text-stone-800 whitespace-pre-wrap">
                    <div className="text-3xl mb-4 opacity-50 select-none">❧</div>
                    {aiLongReview}
                    <div className="mt-8 pt-8 border-t border-stone-50 text-right italic text-stone-400 text-sm">
                      — {persona.name}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="bg-stone-50 p-10 rounded-[2.5rem] space-y-8">
               <div className="text-center">
                  <h3 className="text-lg font-bold text-stone-900">Reader's Evaluation</h3>
                  <p className="text-xs text-stone-500 mt-1">Reflect on the journey and share your final thoughts.</p>
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
                   placeholder="Write your review here... How did this book move you?"
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
                   Post Review & Get Partner's Reply
                 </button>
               </div>

               {(aiResponseToReview || book.rating) && (
                 <div className="mt-8 p-6 bg-white border border-amber-100 rounded-2xl animate-fadeInUp">
                   <div className="flex items-center gap-2 mb-2">
                     <Avatar avatar={persona.avatar} className="w-8 h-8 text-sm" />
                     <span className="text-xs font-bold text-stone-900">{persona.name} responds:</span>
                   </div>
                   <p className="text-sm text-stone-700 italic leading-relaxed font-serif">
                     {aiResponseToReview || "I've carefully considered your thoughts and saved them to our shared memory."}
                   </p>
                 </div>
               )}
            </section>

            <footer className="pt-8 border-t border-stone-100 text-center">
               <div className="flex justify-center mb-2">
                 <Avatar avatar={persona.avatar} className="w-12 h-12 text-2xl" />
               </div>
               <div className="text-sm text-stone-400 font-serif italic">"Truth is only found in dialogue." — {persona.name}</div>
               <div className="mt-8 flex gap-3">
                  <button onClick={() => window.print()} className="flex-1 py-3 border border-stone-200 text-stone-600 rounded-2xl font-bold text-sm hover:bg-stone-50 transition-all">
                    Save as PDF
                  </button>
                  <button onClick={onClose} className="flex-[2] py-3 bg-stone-900 text-white rounded-2xl font-bold text-sm hover:bg-stone-800 transition-all shadow-xl">
                    Close & Finish Journey
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
