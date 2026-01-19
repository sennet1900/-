
export interface Persona {
  id: string;
  name: string;
  role: string;
  relationship: string; 
  description: string;
  avatar: string;
  systemInstruction: string;
  longTermMemory?: string; // NEW: Stores consolidated memories
}

export interface EngineConfig {
  provider: 'gemini' | 'openai'; 
  baseUrl: string;         
  apiKey: string;          
  model: string;           
  temperature: number;
  useThinking: boolean;
  
  // Cloud Backup Settings
  githubToken?: string;
  backupGistId?: string;

  // Memory Settings (NEW)
  autoMemoryThreshold: number; // 0 to disable, or N (e.g. 50, 100)

  // Font Settings
  aiFont: string;          
  userFont: string;        
  
  // Custom Fonts (Uploaded)
  customFontName?: string;      
  customFontData?: string;      
  customNoteFontName?: string;  
  customNoteFontData?: string;  

  readingMode: 'vertical' | 'horizontal';
  autonomousReading: boolean;
  autoAnnotationCount: number; 
  fontSize: number;       
  theme: 'paper' | 'sepia' | 'night' | 'forest' | 'custom'; 
  customBgImage?: string; 
  bgOpacity: number;       
  useBlur: boolean;        
}

export interface Annotation {
  id: string;
  bookId: string;
  textSelection: string;
  comment: string;
  author: 'ai' | 'user';
  timestamp: number;
  personaId?: string;
  topic?: string;
  isAutonomous?: boolean;
  position: {
    startOffset: number;
    endOffset: number;
  };
  // Store the full conversation history
  chatHistory?: { role: string; text: string }[];
}

// NEW: Structured Writing Data
export interface Chapter {
  id: string;
  title: string;
  content: string;
  lastModified: number;
}

export interface WritingMetadata {
  chapters: Chapter[];
  mainOutline: string;      // 作品大纲
  volumeOutline: string;    // 分卷大纲
  inspirations: string;     // 灵感记录
  characterSettings: string;// 角色设定
}

export interface Book {
  id: string;
  title: string;
  content: string; // Compiled content for Reader
  author?: string;
  category: string;
  coverColor: string;
  addedAt: number;
  timeSpent: number; 
  rating?: number;   
  userReview?: string;
  aiReview?: string;
  isOriginal?: boolean;
  writingMetadata?: WritingMetadata; // NEW: Stores structured writing data
}

export type AppState = 'library' | 'reading';
