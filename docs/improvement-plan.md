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

The cycles ran faster than first planned, so the schedule below shows what actually happened and what comes next.

| Time | Cycle | What happened |
|---|---|---|
| 00:15–00:35 | 0 | Pitch deck: generic look, coloured labels and fine print removed. Text judge on deck, script and README: FAIL, FAIL, PASS. |
| 00:15–00:40 | 1 | Prototype v1 reviewed by design, technical, business and feasibility. 22 findings fixed. |
| 00:40–00:55 | 2 | Same reviewers again, plus the first text judge on the app. 21 findings fixed. |
| 00:55–01:05 | 3 | Same reviewers again. 16 findings fixed. Check-in added. |
| 01:05–01:20 | 4 | A new reviewer who has seen nothing before reviewed the whole prototype. 3 P1s fixed. Text judge on the app: PASS after round 4. |
| 01:20–01:50 | 5 | Simulated usability test: an agent played 5 different first-time students doing real tasks. Fixed together with cycle 6. |
| 01:20–01:50 | 6 | Accessibility check: keyboard only, screen reader labels, contrast, zoom to 200%. 4 P1s, 9 P2s fixed across both cycles. |
| 01:20 | 7 | Last look at the pitch deck and script by a reviewer who hadn't seen them. Timing fixed. |
| 01:45–02:05 | 8 | A new reviewer checked the cycle 5 and 6 code change. 5 problems it caused, plus 4 small ones, all fixed. |
| 02:05–02:30 | 9 | Usability re-test (all cycle 5 problems fixed, 1 new P1) and a visual design review. All P1 and P2 fixed. |
| 02:30–02:45 | 10 | A new reviewer checked the cycle 9 change. 1 P1 and 5 P2s from the new screens, all fixed. |
| 02:45–03:00 | 11 | Docs checked against the code (all fixed, text judge PASS) and a security review of the server (2 privacy leaks and 6 P2s fixed). |
| until about 06:15 | 12+ | More find, rank, fix, check cycles on whatever ranks highest. Push after every cycle. |

The deck and script for 9:00 are frozen once they pass. Only the prototype keeps changing after that.
