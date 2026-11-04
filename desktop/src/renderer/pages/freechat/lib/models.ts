// Static mention choices share the application's configured DeepSeek backend.
export const models = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: new URL('../../../assets/deepseek.svg', import.meta.url).href,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    logo: new URL('../../../assets/gemini.svg', import.meta.url).href,
  },
  {
    id: 'claude',
    name: 'Claude',
    logo: new URL('../../../assets/claude.svg', import.meta.url).href,
  },
];
