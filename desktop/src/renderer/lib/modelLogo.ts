const logos = {
  deepseek: new URL('../assets/deepseek.svg', import.meta.url).href,
  kimi: new URL('../assets/kimi.svg', import.meta.url).href,
  gemini: new URL('../assets/gemini.svg', import.meta.url).href,
  claude: new URL('../assets/claude.svg', import.meta.url).href,
};

export function modelLogo(id: string) {
  const name = id.toLowerCase().split('/').at(-1) ?? '';
  return Object.entries(logos).find(([brand]) => name.startsWith(brand))?.[1];
}

export function providerLogo(id: string) {
  if (id.startsWith('moonshotai')) return logos.kimi;
  if (id === 'google') return logos.gemini;
  if (id === 'anthropic') return logos.claude;
  return modelLogo(id);
}
