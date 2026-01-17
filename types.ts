
export interface Persona {
  id: string;
  name: string;
  role: string;
  relationship: string; 
  description: string;
  avatar: string;
  systemInstruction: string;
}

export interface EngineConfig {
  baseUrl: string;         
  apiKey: string;          
  model: string;           
  temperature: number;
  useThinking: boolean;
  
  // Font Settings
  aiFont: string;          // Fallback/Preset for annotations
  userFont: string;        // Fallback/Preset for user notes
  
  // Custom Fonts (Uploaded)
  customFontName?: string;      // Book Content Font Name
  customFontData?: string;      // Book Content Font File (Base64)
  customNoteFontName?: string;  // Annotation/AI Font Name (NEW)
  customNoteFontData?: string;  // Annotation/AI Font File (NEW)

  readingMode: 'vertical' | 'horizontal';
  autonomousReading: boolean;
  autoAnnotationCount: number; // NEW: Number of annotations per page scan
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
}

export interface Book {
  id: string;
  title: string;
  content: string;
  author?: string;
  category: string;
  coverColor: string;
  addedAt: number;
  timeSpent: number; 
  rating?: number;   
  userReview?: string;
  aiReview?: string;
  isOriginal?: boolean;
}

export type AppState = 'library' | 'reading';
