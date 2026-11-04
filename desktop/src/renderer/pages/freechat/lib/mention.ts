// Match an explicit mention, including one followed directly by Chinese text.
// Email addresses, URLs, and longer handles such as @aide are ordinary records.
const mentionPattern =
  /(^|[\s（(，,。！!？?：:；;])@(ai|deepseek|google|gemini|claude)(?![a-z0-9_.+-])/iu;

// Keep mentions in older records working after updating the model choices.
const aliases: Record<string, string> = { ai: 'deepseek', google: 'gemini' };

export function mentionsModel(text: string) {
  return mentionPattern.test(text);
}

export function findModelMentions(text: string) {
  return Array.from(
    text.matchAll(new RegExp(mentionPattern.source, 'giu')),
    (match) => ({
      start: match.index + match[1].length,
      end: match.index + match[0].length,
      modelId: aliases[match[2].toLowerCase()] ?? match[2].toLowerCase(),
    }),
  );
}
