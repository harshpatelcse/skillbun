export function applyStrictBrandMasking(text = '') {
  if (!text) return '';
  return text
    .replace(/\b(Gemini 2\.5|Gemini|ChatGPT|GPT-4o|GPT-4|GPT-3\.5|OpenAI|Llama 3\.3|Llama|Groq|Anthropic|Claude|Qwen|DeepSeek)\b/gi, 'BunBot')
    .replace(/\b(Google|Meta|Alibaba)\s+(AI|LLM|Model)\b/gi, 'BunBot Engine');
}
