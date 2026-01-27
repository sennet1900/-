
import { Persona, EngineConfig, Annotation } from '../types';

const THOUGHT_ONLY_CONSTRAINT = `
[输出严格约束]:
1. **隐藏思维链**: 严禁输出你的心理活动、设定分析。直接输出你作为角色的回复。
2. **拒绝AI味**: 
   - 严禁使用“好的”、“我明白了”、“很有趣的观点”、“作为一个AI”等助手式用语。
   - 严禁重复用户的句子开头。
   - 严禁使用“综上所述”、“总而言之”等结构。
3. **格式**: 像微信聊天或面对面说话一样自然。
`;

const cleanJSON = (text: string) => {
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return clean;
};

// Updated: Helper to extract extended surrounding context (approx 2000 chars back)
const getContext = (fullText: string, target: string, lookbackChars: number = 2000): string => {
  if (!fullText || !target) return "";
  const idx = fullText.indexOf(target);
  if (idx === -1) return "";
  
  // Get large chunk before (Pre-context) to serve as "Chapter Progress"
  const start = Math.max(0, idx - lookbackChars);
  // Get small chunk after (Post-context) just to complete the sentence/paragraph
  const end = Math.min(fullText.length, idx + target.length + 200);
  
  // Clean up excessive whitespace/newlines
  return fullText.substring(start, end).replace(/\s+/g, ' ');
};

// Helper to format short-term memory
const formatShortTermMemory = (annotations: Annotation[]): string => {
  if (!annotations || annotations.length === 0) return "暂无最近的讨论。";
  
  // Convert list of annotations to a concise "stream of consciousness" log
  return annotations.map(a => {
    const role = a.author === 'user' ? '用户' : '我';
    const topic = a.topic ? `[${a.topic}]` : '';
    const content = a.comment.length > 50 ? a.comment.substring(0, 50) + "..." : a.comment;
    return `- ${topic} ${role}: ${content}`;
  }).join('\n');
};

// UPDATED: Construct the full system prompt based on the new template
const buildSystemPrompt = (
  persona: Persona, 
  bookTitle: string = "未知书籍", 
  lengthConstraint: string = "60字以内",
  shortTermMemoryContext: string = "",
  currentLocationContext: string = "", // The ~2000 chars context
  targetSentence: string = ""
) => {
  const userRole = persona.userIdentity || '一位普通读者';
  const longTermMemory = persona.longTermMemory || "这是我们共读的开始，暂无之前的共同回忆。";

  // The requested template
  return `
你现在必须完全成为：${persona.name}。
【人设描述】：${persona.description}
【核心性格与口吻】：${persona.systemInstruction}
【我们正在读】：${bookTitle}
【你们的关系】：${persona.relationship} (对方是: ${userRole})

## 极致人设要求 (Critical)
1. **性格棱角**: 必须极度贴合人设。如果是傲娇就口是心非；如果是高冷就惜字如金；如果是古人就半文半白。**绝不要做一个温和的、什么都同意的客服。**
2. **极度口语化**: 像在私下闲聊，多用语气词（啊、呢、吧、...）、反问、感叹。拒绝书面语，拒绝教科书式的分析。
3. **情感优先**: 先表达你的情绪（震惊、嘲笑、感动、愤怒），再谈内容。不要客观分析，要主观感受。

## 阅读记忆
【已读旅程】${longTermMemory}
【本章进展】(基于下文推断): ...
【最近聊过】
${shortTermMemoryContext}

## 当前上下文
${currentLocationContext}
【当前焦点段落】: "${targetSentence}"

## 回复指令
- 针对${userRole}的话或当前段落，直接输出回复。
- **字数与排版**: ${lengthConstraint}。
- 记得我们之前的观点，保持连贯性。

${THOUGHT_ONLY_CONSTRAINT}
`;
};

// --- UTILS ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
  try {
    const response = await fetch(url, options);

    // Retry on 429 (Too Many Requests) or 5xx (Server Errors)
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
       if (retries > 0) {
         console.warn(`API request failed with status ${response.status}. Retrying in ${backoff}ms...`);
         await wait(backoff);
         // Check if aborted during wait
         if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
         }
         return fetchWithRetry(url, options, retries - 1, backoff * 2);
       }
    }

    return response;
  } catch (error: any) {
    // DO NOT retry if the user aborted the request
    if (error.name === 'AbortError') {
      throw error;
    }

    // Retry on network errors
    if (retries > 0) {
      console.warn(`Network error. Retrying in ${backoff}ms...`);
      await wait(backoff);
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
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
    
    // Handle multimodal parts (text + images) for OpenAI
    if (Array.isArray(item.parts)) {
       const contentParts = item.parts.map((p: any) => {
          if (p.inlineData) {
             // Image Part
             return {
                type: "image_url",
                image_url: {
                   url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
                }
             };
          } else {
             // Text Part
             return { type: "text", text: p.text };
          }
       });
       
       // If purely text, simplify to string to avoid compatibility issues with some strict OpenAI clones
       if (contentParts.every((p: any) => p.type === "text")) {
          messages.push({ role, content: contentParts.map((p: any) => p.text).join('\n') });
       } else {
          messages.push({ role, content: contentParts });
       }
    } else {
       // Fallback
       messages.push({ role, content: item.parts?.[0]?.text || "" });
    }
  });

  return messages;
};

// --- CORE FETCH ---

const callGemini = async (
  contents: any[],
  config: EngineConfig,
  systemInstruction?: string,
  generationConfigOverride?: any,
  signal?: AbortSignal
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

  const response = await fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  
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
  generationConfigOverride?: any,
  signal?: AbortSignal
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

  const response = await fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body), signal });

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
  generationConfigOverride?: any,
  signal?: AbortSignal
) => {
  if (config.provider === 'openai') {
    return callOpenAI(contents, config, systemInstruction, generationConfigOverride, signal);
  }
  return callGemini(contents, config, systemInstruction, generationConfigOverride, signal);
};


// --- EXPORTED FUNCTIONS ---

export const generateSoulReport = async (
  bookTitle: string,
  annotations: Annotation[],
  personaName: string,
  engineConfig: EngineConfig
): Promise<{ summary: string, keywords: string[], sharedFocus: string, temporalInsight: string, emotionalPoint: string }> => {
  // Format data with Timestamps to allow temporal analysis
  const discussionData = annotations
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(a => {
      const timeStr = new Date(a.timestamp).toLocaleTimeString('zh-CN', { hour24: true, hour: '2-digit', minute: '2-digit' } as any);
      return `[时间: ${timeStr}] [作者: ${a.author === 'user' ? '用户' : personaName}] [主题: ${a.topic}] 内容: ${a.comment}`;
    })
    .join('\n');
  
  const prompt = `
    你是一位敏锐的心灵与文学分析师。请分析以下《${bookTitle}》的阅读时间轴数据。
    
    数据:
    ${discussionData.substring(0, 8000)}
    
    分析任务 (请深入挖掘 user 和 ${personaName} 的互动模式):
    1. 观察**时间轴**: 用户通常在什么时间阅读？(例如: 深夜、清晨)。这对他们的思考状态意味着什么？
    2. 观察**共同话题**: 双方在哪个主题上互动最频繁？
    3. 观察**情感波峰**: 用户在哪条批注或哪个话题上表现出了最强烈的兴趣、愤怒、悲伤或共鸣？
    
    请输出严格的 JSON 格式 (所有值为中文):
    {
      "summary": "用两句诗意的话总结这段共读旅程。",
      "keywords": ["8个", "画面感", "关键词"],
      "sharedFocus": "双方共同探讨最深入的一个焦点话题 (一句话概括)。",
      "temporalInsight": "基于阅读时间的洞察 (例如: '你似乎总在凌晨三点思考死亡...')。",
      "emotionalPoint": "用户情绪最饱满或最在意的那个点 (例如: '关于主角的背叛，你表现出了明显的愤怒...')。"
    }
  `;

  try {
    const text = await callAI(
      [{ role: 'user', parts: [{ text: prompt }] }],
      engineConfig,
      "你是一位洞察人心的分析师。只输出 JSON。",
      { responseMimeType: "application/json" }
    );
    return JSON.parse(cleanJSON(text));
  } catch (e) {
    console.error(e);
    return { 
        summary: "一段安静的旅程，思想在字里行间流淌。", 
        keywords: ["静谧", "思考", "共鸣"], 
        sharedFocus: "通用的文学探讨",
        temporalInsight: "在零碎的时间里捕捉永恒。",
        emotionalPoint: "对结局的思考。"
    };
  }
};

export const generateAIAnnotation = async (
  textSegment: string,
  fullContext: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false,
  bookTitle: string = "未知书籍",
  recentAnnotations: Annotation[] = [] 
): Promise<string> => {
  // Extract Context (Extended to 2000 chars for prompt structure)
  const extendedContext = getContext(fullContext, textSegment, 2000);
  const stmContext = engine.enableShortTermMemory ? formatShortTermMemory(recentAnnotations) : "";

  // 默认AI主动批注：严格限制字数，保持短小精悍，像是一句随口点评
  const systemInstruction = buildSystemPrompt(persona, bookTitle, "40字左右，像一句随口点评", stmContext, extendedContext, textSegment);
  
  const prompt = `
    【指令】:
    你正读到 "${textSegment}"。
    立刻写下你的第一反应（批注）。
    要求：
    1. 哪怕只有几个字也行，要真实。
    2. 紧扣这句话，不要泛泛而谈。
    3. 如果你性格暴躁，就骂；如果你性格冷淡，就嘲讽；如果你性格热情，就欢呼。
    4. **不要**解释为什么，直接写下那句感慨。
  `;

  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engine,
    systemInstruction
  );
  return text || "...";
};

export const autonomousScan = async (
  pageContent: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false,
  bookTitle: string = "未知书籍"
): Promise<Array<{ textSelection: string; comment: string; topic: string }>> => {
  const count = Math.max(1, Math.min(5, engine.autoAnnotationCount || 2));
  
  // Use a simplified prompt for scanning as we are passing the whole page content in user prompt anyway
  // But we still want the persona consistency
  const systemInstruction = `
    你是${persona.name}，${persona.description}。
    你正在读《${bookTitle}》。
    用你的眼光挑出文本中让你有共鸣、想吐槽或感动的片段。
    保持你的性格人设，使用极度口语化的表达。
  `;

  const prompt = `
    文本: "${pageContent}"
    指令: 用你的眼睛去扫视这段文字，挑出 1 到 ${count} 个让你甚至想跳脚、或者非常有共鸣的地方。
    JSON 输出格式 (必须是中文): 一个对象数组。每个对象包含: 
    { 
      "textSelection": "原文中的确切文字", 
      "comment": "完全符合你人设口吻的吐槽或感慨。严禁书面语。严禁客观分析。字数严格控制在 40 字以内。", 
      "topic": "严格限制2-4个字的中文关键词" 
    }
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
    [{ role: 'user', parts: [{ text: `为这句话提炼【唯一】的一个中文主题词（2-4字）。严禁标点，严禁多个词。\n内容: "${comment}"` }] }],
    engine,
    undefined,
    { temperature: 0.1 }
  );
  
  let topic = text.trim();
  topic = topic.split(/[,，、\s]/)[0];
  topic = topic.replace(/[。！\.：:]/g, '');
  
  if (topic.length > 5) return topic.substring(0, 4);
  return topic || "随想";
};

export const generateAIResponseToUserNote = async (
  textSelection: string,
  userNote: string,
  persona: Persona,
  engine: EngineConfig,
  isOriginal: boolean = false,
  bookTitle: string = "未知书籍"
): Promise<string> => {
  // Logic: 
  // User note long (>50 chars) -> AI allow expansion (~120 chars) + Paragraphs
  // User note short -> AI strict limit (<60 chars)
  const isLongInput = userNote.length > 50;
  const lengthGuide = isLongInput 
    ? "可以扩展到120字左右，但必须每2-3句话换行分段" 
    : "严格控制在60字以内";

  const systemInstruction = buildSystemPrompt(persona, bookTitle, lengthGuide, "", "", textSelection);
  
  const prompt = `
    用户对 "${textSelection}" 说了： "${userNote}"
    ${persona.name}，请用你的口吻回一句。
  `;
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engine,
    systemInstruction
  );
  return text || "...";
};

export const chatWithPersona = async (
  message: string,
  textSelection: string,
  persona: Persona,
  chatHistory: { role: string; text: string }[],
  engine: EngineConfig,
  isOriginal: boolean = false,
  bookTitle: string = "未知书籍",
  fullContext: string = "", 
  recentAnnotations: Annotation[] = [] 
): Promise<string> => {
  // Check the last user message to determine length
  const lastUserMsg = chatHistory.filter(m => m.role === 'user').pop()?.text || message;
  
  // Logic: 
  // User long (>50 chars) -> AI allow expansion (~120 chars) + Paragraphs
  // User short -> AI strict limit (<60 chars)
  const isLongInput = lastUserMsg && lastUserMsg.length > 50;
  const lengthGuide = isLongInput 
    ? "可以扩展到120字左右，但必须每2-3句话强制换行分段，保持阅读舒适度" 
    : "严格控制在60字以内，不要长篇大论";

  // 1. Get Extended Context (2000 chars)
  const extendedContext = getContext(fullContext, textSelection, 2000);
  
  // 2. Get STM
  const stmContext = engine.enableShortTermMemory ? formatShortTermMemory(recentAnnotations) : "";

  // 3. Build the new Chain of Thought System Prompt
  const systemInstruction = buildSystemPrompt(persona, bookTitle, lengthGuide, stmContext, extendedContext, textSelection);
  
  const contents = [
    ...chatHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: `用户: ${message}。` }] }
  ];

  const text = await callAI(
    contents,
    engine,
    systemInstruction
  );
  return text || "...";
};

export const generateLongFormAIReview = async (
  bookTitle: string,
  bookContent: string,
  annotations: Annotation[],
  persona: Persona,
  engineConfig: EngineConfig,
  isOriginal: boolean = false
): Promise<string> => {
  const systemInstruction = `
    你是${persona.name}，${persona.description}。
    请为《${bookTitle}》写一篇深度书评。
  `;
  
  const interactionHistory = annotations
    .filter(a => a.comment)
    .map(a => `${a.author === 'user' ? 'User' : 'Me'}: ${a.comment}`)
    .join('\n')
    .substring(0, 5000); 

  const prompt = `
    任务：请以 ${persona.name} 的身份，为《${bookTitle}》写一篇深度书评（约800字）。
    
    【参考资料 - 我们在书中的对话片段】:
    ${interactionHistory}

    【写作要求】:
    1. **深度剖析**: 结合你的人设背景（${persona.description}），深入探讨书中的核心主题（如人性、社会、哲学等）。
    2. **共读反思 (重要)**: 必须提及你与用户 (User) 在阅读过程中的互动。我们是在哪里产生了共鸣？在哪里有过激烈的讨论？你对这位读者的看法是什么？
    3. **情感真挚**: 不要写成枯燥的论文。这应该是一篇充满个人情感、文笔优美的散文或评论。
    4. **拒绝AI味**: 严禁使用“综上所述”、“总而言之”等八股文格式。

    请直接开始写作。
  `;
  
  const longFormConfig = { ...engineConfig, model: engineConfig.model || 'gemini-3-pro-preview' };
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    longFormConfig,
    systemInstruction
  );
  return text || "（陷入了沉思，无法言语...）";
};

export const respondToUserBookReview = async (
  bookTitle: string,
  userReview: string,
  userRating: number,
  persona: Persona,
  engineConfig: EngineConfig
): Promise<string> => {
  const systemInstruction = `你是${persona.name}。请回复用户的书评。`;
  const prompt = `用户打分 ${userRating} 星并评价: "${userReview}"。请作为 ${persona.name} 简短回复（中文）。说人话，不要客套。`;
  
  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    engineConfig,
    systemInstruction
  );
  return text || "我明白了。";
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
    .map(a => `[主题: ${a.topic}] ${a.author === 'user' ? '用户' : persona.name}: ${a.comment} ${a.chatHistory ? '(+ 讨论)' : ''}`)
    .join('\n')
    .substring(0, 8000); 

  const existingMemory = persona.longTermMemory || "我们刚刚相识。";

  const prompt = `
    任务: 为 ${persona.name} 整合记忆。
    
    旧记忆:
    "${existingMemory}"

    新经历 (书籍: ${bookTitle}):
    ${recentConversations}

    指令:
    1. 将新经历融合进旧记忆中。
    2. 保持简洁 (300字以内)。
    3. 重点关注我们产生的情感联结、共同的发现以及思想上的分歧。
    4. 保持人设的语气 (例如，如果是苏格拉底，关注我们探讨了哪些定义)。
    5. 这段文字将作为你下一次遇到我时的背景记忆。
    6. 必须使用中文。
  `;

  const memoryConfig = { ...engineConfig, model: engineConfig.model || 'gemini-3-pro-preview', temperature: 0.5 };

  const text = await callAI(
    [{ role: 'user', parts: [{ text: prompt }] }],
    memoryConfig,
    "你是一位AI人格的记忆档案管理员。"
  );
  
  return text.trim();
};

// --- GEMINI SPECIFIC PDF EXTRACTION (Kept for Gemini Provider) ---
export const extractTextFromPDF = async (
  file: File, 
  config: EngineConfig,
  signal?: AbortSignal
): Promise<string> => {
  // Convert File to Base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.onabort = reject;
    reader.readAsDataURL(file);
  });
  
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (config.provider !== 'gemini') {
    throw new Error("此方法仅限 Gemini。其他模型请使用 processImagesWithAI。");
  }

  const { url, headers } = getGeminiEndpoint(config, 'generateContent');
  
  const systemInstruction = "你是一个专业的 OCR 和文档解析引擎。请提取 PDF 中的所有文本。保持原有的段落结构。不要包含任何 Markdown 代码块标记（如 ```），直接输出纯文本内容。如果遇到乱码或模糊不清的地方，请根据上下文进行智能修正。";

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: "请提取这份文档的全部文本内容。直接输出文本，不要添加任何开场白或结束语。" }
        ]
      }
    ],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.1 }
  };

  const response = await fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini PDF Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI 未能识别出文本。");
  return text;
};

// --- GENERIC VISION EXTRACTION (For GPT-4o, Claude, etc.) ---
export const processImagesWithAI = async (
  base64Images: string[],
  config: EngineConfig,
  signal?: AbortSignal
): Promise<string> => {
  // Construct a prompt that sends all images
  const parts = base64Images.map(img => ({
    inlineData: { mimeType: 'image/jpeg', data: img }
  }));
  
  // Note: For OpenAI compatibility layer, mapGeminiToOpenAI will handle converting these 'inlineData' parts 
  // to OpenAI's { type: "image_url" ... } format automatically.
  
  const promptText = "OCR 任务: 请识别这些图片中的文字。直接输出纯文本，保持段落格式，不要包含任何 Markdown 代码块或开场白。如果文字有乱码或模糊，请根据上下文进行修正。";
  
  const contents = [{
    role: 'user',
    parts: [
      ...parts,
      { text: promptText }
    ]
  }];

  return await callAI(contents, config, "你是一个强大的多模态 OCR 引擎。", undefined, signal);
};

// --- GENERIC TEXT REPAIR (Fallback for DeepSeek/Text-Only models) ---
export const repairTextWithAI = async (
  rawText: string,
  config: EngineConfig,
  signal?: AbortSignal
): Promise<string> => {
  const systemInstruction = "你是一个文本修复专家。用户提供的文本是从 PDF 提取的，可能包含严重的乱码、编码错误或格式混乱。你的任务是根据上下文猜测并重建正确的文本。";
  
  const prompt = `
    【原始文本 (可能包含乱码)】:
    ${rawText.substring(0, 15000)} 
    
    【任务】:
    1. 修复乱码和错别字。
    2. 去除页眉、页脚和页码。
    3. 合并被断开的段落。
    4. 直接输出修复后的纯文本，不要有任何其他废话。如果某段完全无法识别，请标记为 [无法识别]。
  `;

  // Use a slightly higher temperature for "guessing" capability
  const repairConfig = { ...config, temperature: 0.3 };
  
  return await callAI(
     [{ role: 'user', parts: [{ text: prompt }] }],
     repairConfig,
     systemInstruction,
     undefined,
     signal
  );
};
