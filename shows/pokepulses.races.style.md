# PokePulses ranked races: style guide

Ranked races are a second format for PokePulses: many Pokémon in one video, ranked on one figure. They live apart from the one-Pokémon episodes (`races/`, not `videos/`), so [pokepulses.style.md](pokepulses.style.md) still governs every episode, including "only the episode's own Pokémon is shown". This guide replaces that rule for races only.

## What a race is
One question ("Who has the most HP?"), up to ten Pokémon from one group, one figure from the pinned PokéAPI table. 24 to 30 seconds. The answer should surprise a fan, and the last card should start an argument.

## Story
- The race decides the story: a top race ends with the last bar still counting, a bottom race with the first bar to stop.
- The rows start in the order fans expect (total stats) and re-sort to the real order, so the surprise is visible.
- The payoff contrasts the winner with itself (its weakest stat, its best stat, or where it ranks on total stats), never with a fact that isn't in the table.
- Headlines and the question may be rewritten by hand, but every number stays the table's. `npm run races:render` refuses a race whose racers no longer match the table.

## Visuals
- Every racer is shown with its official artwork; the winner is the accent colour and the only bar that glows.
- No narration: the headlines carry the story, one at a time, at the top of the frame.
- The caption says what the figures are: base stats or Pokédex data from the current games, and, for evolution groups, which generation's Pokédex the stages are judged by.

## Sound
- The score builds with the race and peaks at the reveal; each bar's stop is a note, climbing as the race goes on.
- The winner's moment is the only big hit. Neighbouring races shouldn't share a score.

## Never
- Draw anyone who is not in the race, or fan art.
- Race a tie for first, or a group of fewer than six.
- Round a figure differently from the table's units (metres and kilograms to one decimal, stats as whole numbers).
