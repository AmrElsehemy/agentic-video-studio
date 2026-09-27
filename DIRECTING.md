# Viral Director Contract

The studio does not turn records into slides. It turns one arguable idea into a short story.

## Every episode

1. **Tension in frame one** — contradiction, risk, surprise, or a defensible hot take, landed within the hook's time limit.
2. **An open loop** — a question the viewer cannot answer from the hook alone.
3. **Escalation** — each beat raises the stakes or deepens the idea; no unrelated facts. How many escalating beats a story needs depends on its shape.
4. **Pattern interrupts** — a meaningful visual, copy, scale, colour, or sound change every 1.2 seconds or less.
5. **A payoff** — resolve the opening promise before asking for engagement.
6. **A debatable interaction** — ask viewers to choose between credible positions.

## Depends on the story shape

Each story shape in `archetypes/<name>.json` defines its own beats, and with them its extra requirements:

- **A counterpoint** (the claim survives a real objection) is required when the shape has a required `twist` beat: today **profile** and **comparison**, which argue a position. **Mechanic**, **transformation** and **mystery** build tension through escalation and reveals instead, so they don't need one.
- **How much escalation** is needed follows the beats: for example, mystery needs at least one clue and two reveals, while profile needs at least two pieces of evidence.
- **The hook's time limit** is the hook beat's `maxSeconds` (4.8s for every shape today).

## Checking it

`npm run engagement -- <episode-id>` scores these requirements. A score below 80 blocks director approval. It is a structural pre-render check, not proof that a story is good, and not proof of virality. Actual watch-time, hold rate, completion, rewatch, share, save, and comment data must eventually feed the director's next decision.
