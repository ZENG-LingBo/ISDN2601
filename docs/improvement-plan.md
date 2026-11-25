# Improvement plan

Started 26 Nov 2026, 00:15 Hong Kong time. Runs for about 6 hours.

## How each cycle works

1. **Find.** Independent reviewer agents look at the work from one angle each. They report problems only and don't edit anything.
2. **Rank.** Each problem gets a priority:
   - P1: it breaks something, or it hurts the pitch tomorrow.
   - P2: it clearly makes the work worse.
   - P3: nice to have.
3. **Fix.** P1 and P2 are fixed in the same cycle. P3 is fixed only if it is quick.
4. **Check.** Unit and server tests (`npm test`), the browser walkthrough (`node test/e2e.mjs`), and screenshots at phone size in light and dark mode.
5. **Log.** What was found, what changed and what was left goes into [`review-log.md`](review-log.md).

## Writing rules for all text

These apply to the app, the messages it writes for the group chat, the README, the deck and the script. They are based on Apple's Human Interface Guidelines (Writing) and Google's Material Design and developer documentation style guides.

- Use everyday words and normal sentences. If a reader has to stop and work out what a phrase means, rewrite it.
- Talk to the reader as "you". Use active voice and present tense.
- Keep it short. Put the most important words first.
- Use sentence case for headings and buttons.
- Buttons say exactly what happens ("Lock in this time", "Copy message").
- Error messages say what went wrong and what to do next.
- No slang, no in-jokes, no clever metaphors in instructions. The minibus idea can stay as the name and one short explanation, not as the wording of every control.
- No tiny grey "fine print". Secondary text is the same size as body text, or close to it, and easy to read.
- Avoid emoji in the interface.

A separate agent, which has not seen how the text was written, reads all the text and gives a pass or fail verdict against these rules. Text is rewritten and re-checked until it passes.

## Schedule (Hong Kong time)

| Time | Work |
|---|---|
| 00:15–01:00 | Prototype v1 done. Review round 1: design, technical, business and feasibility, in parallel. Meanwhile: fix the deck (fine print, coloured labels, generic look). |
| 01:00–01:45 | Fix round 1 findings. Rewrite all text to the writing rules. |
| 01:45–02:30 | Review round 2 (same four angles) plus the first text verdict. Fix. |
| 02:30–03:15 | Review round 3 plus the text verdict again. Fix. |
| 03:15–04:00 | Final review by a new agent that has seen nothing before. Fix. Publish the demo. |
| 04:00–06:15 | More cycles on whatever the last reviews rank highest. Keep the text verdict passing. Push after every cycle. |

The pitch is at 9:00. The deck and script are frozen once they pass, and only the prototype keeps changing after that.
