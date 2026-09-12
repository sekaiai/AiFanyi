export function buildPrompt(template: string, text: string): string {
  const source = text.trim()
  const prompt = template.trim()
  return prompt.includes('{text}') ? prompt.replaceAll('{text}', source) : `${prompt}\n\n${source}`.trim()
}
