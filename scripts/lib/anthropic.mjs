// Minimal client for Claude's Messages API, used by the writer agent.

export const DEFAULT_WRITER_MODEL = 'claude-opus-5-5';

export const createClaudeCompletion = ({apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.WRITER_MODEL ?? DEFAULT_WRITER_MODEL, maxTokens = 8000} = {}) => {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for the writer agent. Set it, or write the draft by hand in drafts/<show>/<id>.json.');
  return async ({system, messages}) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
      body: JSON.stringify({model, max_tokens: maxTokens, system, messages}),
    });
    if (!response.ok) throw new Error(`Claude request failed (${response.status}): ${await response.text()}`);
    const data = await response.json();
    if (data.stop_reason === 'max_tokens') throw new Error('Claude reply was cut off (max_tokens). Increase maxTokens.');
    return data.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  };
};
