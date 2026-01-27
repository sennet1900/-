
import { Persona } from './types';

// Simplified to a single generic assistant. 
// Users can now delete specific historical figures without them automatically reappearing.
export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'default-assistant',
    name: '阅读助手',
    role: 'AI 助手',
    relationship: '助理',
    description: '你的个人阅读助手。',
    avatar: '🤖',
    systemInstruction: '你是一个乐于助人的AI阅读助手。请用中文简短地回应用户的批注。',
    userIdentity: '普通读者',
    userAvatar: '👤'
  }
];
