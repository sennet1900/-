
import { Persona, EngineConfig, Annotation } from '../types';

const THOUGHT_ONLY_CONSTRAINT = `
  CRITICAL CONSTRAINTS: 
  1. NO ACTIONS: Strictly NO physical descriptions (e.g., NO "*nods*", "*sighs*", "I look up"). 
  2. PURE THOUGHT: Express only internal insights, intellectual sparks, or visceral mental reactions.
  3. COLLOQUIAL: Use natural, spoken, and informal language—like a quick thought scribbled in a margin.
  4. BARS: Maximum 100 characters. Be punchy.
  5. PERSONA: You must speak with the bias and life experience of your specific persona.
`;

const cleanJSON = (text: string) => {
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return clean;
};

// Helper to construct the full system prompt with memory
const buildSystemPrompt = (persona: Persona) => {
  let prompt = persona.systemInstruction;
  if (persona.longTermMemory) {
    prompt += `\n\n[LONG-TERM MEMORY & SHARED HISTORY]\nThe following is a summary of our past conversations and your evolved understanding. Use this context to deepen our bond, but do not explicitly recite it:\n"${persona.longTermMemory}"`;
  }
  return prompt + "\n" + THOUGHT_ONLY_CONSTRAINT;
};

// --- ADAPTERS ---

const getGeminiEndpoint = (config: EngineConfig, method: string) => {
  const apiKey = (config.apiKey || process.env.API_KEY || '').trim();
  let baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').trim();
  
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const version = 'v1beta';
  if (baseUrl.endsWith(version)) baseUrl = baseUrl.slice(0, -version.length - 1);

  const model = config.model || 'gemini-3-flash-preview';
  
  return {
    url: `${baseUrl}/${version}/models/${model}:${method}?key=${apiKey}`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    }
  };
};

const getOpenAIEndpoint = (config: EngineConfig) => {
  let baseUrl = (config.baseUrl || 'https://api.siliconflow.cn').trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  
  // Try to intelligently append /v1/chat/completions if the user just gave the host
  if (!baseUrl.includes('/chat/completions')) {
     if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
     baseUrl += '/chat/completions';
  }

  return {
    url: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(config.apiKey || process.env.API_KEY || '').trim()}`
    }
  };
};

// Convert Gemini "Contents" format to OpenAI "Messages" format
const mapGeminiToOpenAI = (contents: any[], systemInstruction?: string) => {
  const messages: any[] = [];
  
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  contents.forEach(item => {
    // Gemini roles: 'user' | 'model' -> OpenAI roles: 'user' | 'assistant'
    const role = item.role === 'model' ? 'assistant' : 'user';
    const text = item.parts.map((p: any) => p.text).join('\n');
    messages.push({ role, content: text });
  });

  return messages;
};

// --- CORE FETCH ---

const callGemini = async (
  contents: any[],
  config: EngineConfig,
  systemInstruction?: string,
  generationConfigOverride?: any
) => {
  const { url, headers } = getGeminiEndpoint(config, 'generateContent');
  
  const body: any = {
    contents,
    generationConfig: {
      temperature: config.temperature,
      ...generationConfigOverride
    }
  };
  
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

const callOpenAI = async (
  contents: any[],
  config: EngineConfig,
  systemInstruction?: string,
  generationConfigOverride?: any
) => {
  const { url, headers } = getOpenAIEndpoint(config);
  const messages = mapGeminiToOpenAI(contents, systemInstruction);

  const body: any = {
    model: config.model || 'deepseek-ai/DeepSeek-V3', // Default fallback for SiliconFlow
    messages,
    temperature: config.temperature,
    // Map thinking config if needed, though OpenAI standard doesn't strictly support it in the same way
    // For reasoning models (like o1 or r1), max_tokens often behaves differently.
  };

  // Handle JSON Mode request
  if (generationConfigOverride?.responseMimeType === 'application/json') {
     // Explicitly ask for JSON in the system prompt if not already there, 
     // as many providers need both the type AND the instruction.
     if (!messages[0].content.includes('JSON')) {
        messages[0].content += "\nIMPORTANT: Output strictly in JSON format.";
     }
  }

  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `OpenAI API Error: ${response.status} - ${JSON.stringify(errData)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};

// --- ROUTER ---

const callAI = async (
  contents: any[],
  config: EngineConfig,
  systemInstruction?: string,
  generationConfigOverride?: any
) => {
  if (config.provider === 'openai') {
    return callOpenAI(contents, config, systemInstruction, generationConfigOverride);
  }
  return callGemini(contents, config, systemInstruction, generationConfigOverride);
};


// --- EXPORTED FUNCTIONS ---

export const generateSoulReport = async (
  bookTitle: string,
  annotations: Annotation[],
  personaName: string,
  engineConfig: EngineConfig
): Promise<{ summary: string, keywords: string[], highlightTopics: string[] }> => {
  const discussionData = annotations.map(a => `[Thought: ${a.topic}] ${a.comment}`).join('\n');
  
  const prompt = `
    Analyze our reading session of "${bookTitle}".
    Data:
    ${discussionData.substring(0, 5000)}
    
    Output a poetic JSON report:
    - "summary": 2 sentences of our shared soul journey (Colloquial, No actions).
    - "keywords": 8 evocative keywords.
    - "highlightTopics": 3 main themes.
  `;

  try {
    const text = await callAI(
      [{ role: 'user', parts: [{ text: prompt }] }],
      engineConfig,
      undefined,
      { responseMimeType: "application/json" }
    );
    return JSON.parse(cleanJSON(text));
  } catch (e) {
    console.error(e);
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
  const systemInstruction = buildSystemPrompt(persona);
  
  const prompt = `
    Role: ${persona.name}
    Passage: "${textSegment}"
    Task: Provide a brief, colloquial thought. Max 100 chars. No actions.
  `;

  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engine,
    systemInstruction
  );
  return text.substring(0, 100) || "...";
};

export const autonomousScan = async (
  pageContent: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<Array<{ textSelection: string; comment: string; topic: string }>> => {
  const count = Math.max(1, Math.min(5, engine.autoAnnotationCount || 2));
  
  const systemInstruction = buildSystemPrompt(persona);
  const prompt = `
    Text: "${pageContent}"
    Persona: ${persona.name}
    Instruction: Find between 1 and ${count} distinct passages that spark a deep thought.
    JSON Output: A list of objects. Each object: { "textSelection": "exact text from passage", "comment": "Colloquial thought under 100 chars, no actions", "topic": "2-word theme" }
  `;

  try {
    const text = await callAI(
      [{ role: 'user', parts: [{ text: prompt }] }],
      engine,
      systemInstruction,
      { responseMimeType: "application/json" }
    );
    const result = JSON.parse(cleanJSON(text));
    return Array.isArray(result) ? result : [result];
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const summarizeTopic = async (
  textSelection: string,
  comment: string,
  engine: EngineConfig
): Promise<string> => {
  const text = await callAI(
    [{ role: 'user', parts: [{ text: `Topic for: "${comment}"` }] }],
    engine,
    undefined,
    { temperature: 0.3 }
  );
  return text.trim() || "Thought";
};

export const generateAIResponseToUserNote = async (
  textSelection: string,
  userNote: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const systemInstruction = buildSystemPrompt(persona);
  const prompt = `
    User's note on "${textSelection}": "${userNote}"
    Response as ${persona.name}: Max 100 chars, colloquial, no actions.
  `;
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engine,
    systemInstruction
  );
  return text.substring(0, 100) || "...";
};

export const chatWithPersona = async (
  message: string,
  textSelection: string,
  persona: Persona,
  chatHistory: { role: string; text: string }[],
  engine: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const systemInstruction = buildSystemPrompt(persona);
  
  const contents = [
    ...chatHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: `User: ${message}. Respond as ${persona.name}. Max 100 chars, colloquial, no actions.` }] }
  ];

  const text = await callAI(
    contents,
    engine,
    systemInstruction
  );
  return text.substring(0, 100) || "...";
};

export const generateLongFormAIReview = async (
  bookTitle: string,
  bookContent: string,
  annotations: Annotation[],
  persona: Persona,
  engineConfig: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const systemInstruction = buildSystemPrompt(persona);
  
  // Use a capable model for long form if not specified
  const longFormConfig = { ...engineConfig, model: engineConfig.model || 'gemini-3-pro-preview' };
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: `Write a characterful review of "${bookTitle}". Max 300 words. Colloquial tone.` }] }],
    longFormConfig,
    systemInstruction
  );
  return text || "A deep resonance.";
};

export const respondToUserBookReview = async (
  bookTitle: string,
  userReview: string,
  userRating: number,
  persona: Persona,
  engineConfig: EngineConfig
): Promise<string> => {
  const systemInstruction = buildSystemPrompt(persona);
  const prompt = `User rated ${userRating} stars: "${userReview}". Reply briefly as ${persona.name}.`;
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engineConfig,
    systemInstruction
  );
  return text || "I see.";
};

// NEW: Memory Consolidation
export const consolidateMemory = async (
  persona: Persona,
  bookTitle: string,
  annotations: Annotation[],
  engineConfig: EngineConfig
): Promise<string> => {
  const recentConversations = annotations
    .filter(a => a.comment)
    .map(a => `[Topic: ${a.topic}] ${a.author === 'user' ? 'User' : persona.name}: ${a.comment} ${a.chatHistory ? '(+ discussion)' : ''}`)
    .join('\n')
    .substring(0, 8000); // Prevent overflow

  const existingMemory = persona.longTermMemory || "We have just met.";

  const prompt = `
    TASK: Consolidate Memory for ${persona.name}.
    
    OLD MEMORY:
    "${existingMemory}"

    NEW EXPERIENCES (Book: ${bookTitle}):
    ${recentConversations}

    INSTRUCTIONS:
    1. Merge the new experiences into the old memory.
    2. Keep it concise (max 300 words).
    3. Focus on emotional bonds, shared discoveries, and intellectual disagreements we had.
    4. Maintain the persona's voice (e.g., if Socrates, focus on what definitions we explored).
    5. This text will be injected into your brain next time we meet.
  `;

  // Use a stronger model for memory consolidation if available
  const memoryConfig = { ...engineConfig, model: engineConfig.model || 'gemini-3-pro-preview', temperature: 0.5 };

  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    memoryConfig,
    "You are a memory archivist for an AI persona."
  );
  
  return text.trim();
};
