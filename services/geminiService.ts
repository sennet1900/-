
import { GoogleGenAI, Type } from "@google/genai";
import { Persona, EngineConfig, Annotation } from '../types';

// Initialize AI with the specific API Key provided in config
// Falls back to process.env for development defaults if config is empty
const getAI = (config?: EngineConfig) => {
  return new GoogleGenAI({ 
    apiKey: config?.apiKey || process.env.API_KEY || '',
  });
};

const THOUGHT_ONLY_CONSTRAINT = `
  CRITICAL CONSTRAINTS: 
  1. NO ACTIONS: Strictly NO physical descriptions (e.g., NO "*nods*", "*sighs*", "I look up"). 
  2. PURE THOUGHT: Express only internal insights, intellectual sparks, or visceral mental reactions.
  3. COLLOQUIAL: Use natural, spoken, and informal language—like a quick thought scribbled in a margin.
  4. BARS: Maximum 100 characters. Be punchy.
  5. PERSONA: You must speak with the bias and life experience of your specific persona.
`;

export const generateSoulReport = async (
  bookTitle: string,
  annotations: Annotation[],
  personaName: string,
  engineConfig: EngineConfig
): Promise<{ summary: string, keywords: string[], highlightTopics: string[] }> => {
  const ai = getAI(engineConfig);
  const discussionData = annotations.map(a => `[Thought: ${a.topic}] ${a.comment}`).join('\n');
  
  const response = await ai.models.generateContent({
    model: engineConfig.model || 'gemini-3-flash-preview',
    contents: `
      Analyze our reading session of "${bookTitle}".
      Data:
      ${discussionData.substring(0, 5000)}
      
      Output a poetic JSON report:
      - "summary": 2 sentences of our shared soul journey (Colloquial, No actions).
      - "keywords": 8 evocative keywords.
      - "highlightTopics": 3 main themes.
    `,
    config: { 
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          highlightTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["summary", "keywords", "highlightTopics"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { summary: "A quiet exchange of minds.", keywords: ["Thought"], highlightTopics: ["General"] };
  }
};

export const generateAIAnnotation = async (
  textSegment: string,
  fullContext: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const ai = getAI(engine);
  const config: any = {
    systemInstruction: `${persona.systemInstruction}\n${THOUGHT_ONLY_CONSTRAINT}`,
    temperature: engine.temperature,
  };

  const response = await ai.models.generateContent({
    model: engine.model || 'gemini-3-flash-preview',
    contents: `
      Role: ${persona.name}
      Passage: "${textSegment}"
      Task: Provide a brief, colloquial thought. Max 100 chars. No actions.
    `,
    config,
  });

  return response.text?.substring(0, 100) || "...";
};

export const autonomousScan = async (
  pageContent: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<{ textSelection: string; comment: string; topic: string } | null> => {
  const ai = getAI(engine);
  const response = await ai.models.generateContent({
    model: engine.model || 'gemini-3-flash-preview', 
    contents: `
      Text: "${pageContent}"
      Persona: ${persona.name}
      Instruction: Find 1 sentence that sparks a thought. 
      JSON Output: { "textSelection": "...", "comment": "Colloquial thought under 100 chars, no actions", "topic": "2-word theme" }
    `,
    config: {
      systemInstruction: persona.systemInstruction + "\n" + THOUGHT_ONLY_CONSTRAINT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          textSelection: { type: Type.STRING },
          comment: { type: Type.STRING },
          topic: { type: Type.STRING }
        },
        required: ["textSelection", "comment", "topic"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "null");
  } catch (e) {
    return null;
  }
};

export const summarizeTopic = async (
  textSelection: string,
  comment: string,
  engine: EngineConfig
): Promise<string> => {
  const ai = getAI(engine);
  const response = await ai.models.generateContent({
    model: engine.model || 'gemini-3-flash-preview',
    contents: `Topic for: "${comment}"`,
    config: { temperature: 0.3 }
  });
  return response.text?.trim() || "Thought";
};

export const generateAIResponseToUserNote = async (
  textSelection: string,
  userNote: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const ai = getAI(engine);
  const response = await ai.models.generateContent({
    model: engine.model || 'gemini-3-flash-preview',
    contents: `
      User's note on "${textSelection}": "${userNote}"
      Response as ${persona.name}: Max 100 chars, colloquial, no actions.
    `,
    config: { systemInstruction: persona.systemInstruction + "\n" + THOUGHT_ONLY_CONSTRAINT },
  });
  return response.text?.substring(0, 100) || "...";
};

export const chatWithPersona = async (
  message: string,
  textSelection: string,
  persona: Persona,
  chatHistory: { role: string; text: string }[],
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const ai = getAI(engine);
  const response = await ai.models.generateContent({
    model: engine.model || 'gemini-3-flash-preview',
    contents: [
      ...chatHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
      { parts: [{ text: `User: ${message}. Respond as ${persona.name}. Max 100 chars, colloquial, no actions.` }] }
    ],
    config: { systemInstruction: persona.systemInstruction + "\n" + THOUGHT_ONLY_CONSTRAINT },
  });
  return response.text?.substring(0, 100) || "...";
};

// Functions for Reading Report UI
export const generateLongFormAIReview = async (
  bookTitle: string,
  bookContent: string,
  annotations: Annotation[],
  persona: Persona,
  engineConfig: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const ai = getAI(engineConfig);
  const response = await ai.models.generateContent({
    model: engineConfig.model || 'gemini-3-pro-preview', 
    contents: `Write a characterful review of "${bookTitle}". Max 300 words. Colloquial tone.`,
    config: { systemInstruction: persona.systemInstruction + "\n" + THOUGHT_ONLY_CONSTRAINT }
  });
  return response.text || "A deep resonance.";
};

export const respondToUserBookReview = async (
  bookTitle: string,
  userReview: string,
  userRating: number,
  persona: Persona,
  engineConfig: EngineConfig
): Promise<string> => {
  const ai = getAI(engineConfig);
  const response = await ai.models.generateContent({
    model: engineConfig.model || 'gemini-3-flash-preview',
    contents: `User rated ${userRating} stars: "${userReview}". Reply briefly as ${persona.name}.`,
    config: { systemInstruction: persona.systemInstruction + "\n" + THOUGHT_ONLY_CONSTRAINT }
  });
  return response.text || "I see.";
};
