# Review log

Each cycle: independent reviewers report problems, the problems are ranked (P1 breaks something or hurts the pitch, P2 clearly makes it worse, P3 nice to have), fixes are made, and the work is checked again. See [`improvement-plan.md`](improvement-plan.md).

## Cycle 0: pitch deck (26 Nov, 00:20)

One design reviewer looked at the deck for generic, generated-looking design.

| Priority | Finding | Change |
|---|---|---|
| P1 | Cream background, serif headings and coral accent: a look that many generated decks share. | New palette: near-white, dark ink, one green. One typeface (DM Sans). |
| P1 | Coloured all-caps labels above every title. | Removed. The section name is now part of the title, in sentence case ("Target user: Mandy, Year 2 at HKUST"). |
| P1 | Small grey source lines under every number. | Removed. A short citation now ends each sentence at normal size. Sample sizes moved to the references slide. |
| P2 | Numbered pain points that aren't a sequence. | Numbers removed. |
| P2 | Rounded tinted boxes everywhere. | Removed. Plain columns with a top rule; the empathy map is now four quadrants split by lines. |
| P2 | Paradox slide showed four big numbers in 15 seconds. | Only "1 in 3" stays big; the others are in the sentences. |
| P2 | Slide text didn't match what is said (extra sentences, a closing line shown 20 seconds early). | Slide text and speaker notes now match the script. |
| P3 | Liu et al. dated 2022 on one slide and 2023 on another. | 2023 everywhere. |

Also changed to follow the writing rules: "flake" became "cancel plans at the last minute", "too keen" became "too eager", and "plans die" became "plans fall through". The script went from 277 to 260 words to fit in about 1:50.

## Cycle 1: prototype round 1 (26 Nov, 00:15–00:40)

Four reviewers worked in parallel: design, technical, business and feasibility. All four said the prototype was not ready for real users yet, for fixable reasons. Separately, a text judge checked the deck, script and README three times against Apple's and Google's writing guidance: FAIL, FAIL, then PASS.

### Fixed

| Priority | From | Finding | Change |
|---|---|---|---|
| P1 | Technical, design, business | People could work out who said yes or no by comparing what changed (the waiting list named people). | No names before a plan is confirmed. Counts per time stay hidden until 2 people are in. The reminder message never names anyone. Test added. |
| P1 | Technical, feasibility | Losing browser data made a "ghost" member, and the plan waited for them forever. | Private link to use the group on another device. Plans now confirm after 48 hours even if someone never answers. Group size can be changed. Members can leave and delete their answers. |
| P1 | Technical | A damaged data file was treated as empty and then overwritten. | Only a missing file counts as a first run. A damaged file is moved aside and logged. Tests added. |
| P1 | Technical, feasibility | The write limit was per network address, so a whole campus shared it. | Limits are per member. Behind a proxy, `TRUST_PROXY=1` uses the real address for new groups and joins. Test added. |
| P1 | Feasibility | No privacy notice and no way to delete data (Hong Kong PDPO). | Notice on the create and join screens. "Leave and delete my answers" on the group page. Privacy section in the README. |
| P1 | Design | A friend who just joined had to scroll past a reminder to find their own question. | Until you answer, your question and the time grid come first. |
| P1 | Design | People who said yes were silently dropped when the plan moved or after they joined late. | They now see "The plan is set for … Can you make it?" with a one-tap answer. |
| P1 | Design | Focus was lost after every tap and every live update. | Every control has a stable id and focus is restored. Changes from other people are announced to screen readers. |
| P2 | Technical | Quick taps on the time grid were dropped. | Taps show at once and are sent together. The walkthrough checks that 4 quick taps all save. |
| P2 | Technical | `__proto__`-style ids, null bodies and reused place ids caused errors or junk data. | Ids are checked with own-property lookups, bodies must be objects, and the server picks place ids. Tests added. |
| P2 | Technical | "Did it happen?" opened when the plan started, and anyone could close it. | It opens after the plan ends, and only people who went can answer. |
| P2 | Technical | A plan could be confirmed for a time starting in minutes; plans with no days left stayed open. | Times close 2 hours before they start. Plans with no open times show "This plan ran out of days". |
| P2 | Design | A confirmed plan could have no place. | The confirmed card asks for a place and shows the place list. |
| P2 | Design | The confirmed page still showed the whole form; nobody was told to post the result. | "Copy message for the group chat" comes first. The rest folds under "Change my answers". |
| P2 | Design | Changing times dropped your time before you could add another. | One panel: pick other times, then save once. |
| P2 | Design | Borders and placeholder text were too faint; errors only showed in a toast. | Borders now meet 3:1. Visible labels on every field. Errors appear under the field and focus moves there. |
| P2 | Design | The "open a second tab" demo instruction didn't work. | Replaced with a "See it as" switcher in a clearly separate demo box. |
| P2 | Feasibility | Screens went stale after switching back from WhatsApp. | The page refreshes when it becomes visible again and when the live connection reconnects. |
| P2 | Technical | Member key sent in the address; saves could be delayed forever. | Key moved to headers. Saves wait at most 2 seconds and are flushed to disk. |
| P3 | Design | Touch targets under 44 px; grid headers collided at 320 px; dark placard glare. | Fixed. The walkthrough checks there is no sideways scrolling at 320 px. |
| P3 | Business | Hall's 200 hours is for two friends, not a group. | The group page now says "two friends". It counts times you met first, hours second. |
| P3 | Business | No easy way to meet again. | "Plan the same thing again" after a plan ends. |

### Left for later

- **Timetable import from an .ics file** (business, feasibility): the most realistic use of the brief's enabling technology.
- **NFC or QR check-in** at a campus spot, to confirm "did you meet?" (business, feasibility).
- **Web Push reminders** (feasibility). On iPhone they need "Add to Home Screen".
- **Data export for the user test** with an admin token, and answer timestamps (feasibility).
- **Look-alike characters in names**, like a Cyrillic "а" (technical): not handled yet.

### Tests

38 unit and server tests pass (up from 27). The browser walkthrough covers both versions, two friends live, inline errors, quick taps, the "Can you make it?" prompt and the 320 px width.

## Cycle 2: prototype round 2 (26 Nov, 00:40–01:20)

The same four reviewers checked their round 1 findings and looked for new problems. The text judge read every word in the app for the first time.

| Reviewer | Verdict before the fixes below |
|---|---|
| Design | 13 of 15 fixed. Not ready: the page jumped after a friend's first answer. |
| Technical | 9 of 11 fixed, no security or data-loss problems left. Ready with conditions: totals could still reveal who said yes. |
| Business | A strong direction for the next stage. The README promised more than the app does. Next feature: QR check-in. |
| Feasibility | Feasible. Missing: a way to download the data, and a fuller privacy notice. |
| Text (app) | FAIL: 17 lines, including telling people to paste their private link into the group chat. |

### Fixed

| Priority | From | Finding | Change |
|---|---|---|---|
| P1 | Technical | The second person to join could still work out the first person's answer and free times from totals. | Totals show only once 2 *other* people are in (the viewer doesn't count). How many said yes isn't shared until the plan is confirmed; only how many answered. New test: a yes and a no look the same to everyone else. |
| P1 | Design | The page jumped after a friend's first answer, so the next tap hit the wrong thing. | The screen order is decided once when the plan opens and kept for the visit. The walkthrough checks the grid stays put. |
| P1 | Text | "Copied. Now paste it into your group chat." appeared after copying the private link. | "Copied. Open it on your other phone." |
| P2 | Technical | Opening someone else's private link silently replaced who you are. | Minibus asks "Switch to Mandy?" first. "Make a new private link" makes the old one stop working. |
| P2 | Technical | Leaving didn't lower the group size, so the plan waited for nobody. | Leaving or removing someone lowers the group size. |
| P2 | Feasibility, technical | Someone who lost their phone stayed in the group forever. | Anyone can remove a member who joined but never answered anything. |
| P2 | Feasibility | No way to download the data or delete a group. | `/api/admin/export` and `DELETE /api/admin/crews/:id`, both only with `ADMIN_TOKEN`. The export has no private keys. |
| P2 | Feasibility | The privacy notice didn't say who runs it, why, until when, or who to contact. | Set with `MINIBUS_OPERATOR`, `MINIBUS_CONTACT` and `MINIBUS_DELETE_BY`. README has a consent checklist and deletion steps. |
| P2 | Feasibility | Answers had no timestamps; nothing was counted. | First and latest answer times. Counts of copied messages, calendar taps, moves and resets per plan. |
| P2 | Design | Focus dropped to the top of the page when the pressed button disappeared. | Focus moves to the new status heading. |
| P2 | Design | The demo box was the first thing a tester saw. | Folded into a closed "Demo controls" section. |
| P2 | Feasibility | Nobody was prompted to save their private link. | After joining, a banner offers "Copy my private link". |
| P3 | Technical | The proxy address check trusted the first entry, which clients can fake. | Uses the last entry. Test added. |
| P3 | Technical | One damaged group set aside the whole data file. | Only the damaged group is set aside. Test added. |
| P3 | Technical | Grid saves could arrive out of order; taps weren't sent when the page was hidden. | Saves are sent one after another. Waiting taps are sent when the page is hidden or closed. |
| P3 | Technical | Reading a group had no limit and did extra work on every request. | Per-address read limit. The server only saves and notifies when something actually changed. |
| P3 | Technical | If everyone going dropped out in the last 2 hours, "Did you meet?" stayed open forever. | That plan now shows "You didn't meet this time". |
| P3 | Design | Odd deadlines like "00:37", empty "0 people free" options, wrapping day labels, a small back link, two overlapping "change" buttons. | Deadlines are a round hour. Empty options hidden. Day labels fit at 320 px. 44 px back link. One "Change my times" button. |
| P3 | Feasibility | Join limit too tight for a class on one network. | Joins have their own, higher limit. |
| — | Text | Word-list slips, idioms and long sentences (16 more lines). | All fixed. |
| — | Business | README overclaims. | README rewritten to match what the app does, including its limits. |

### Tests

50 unit and server tests pass (up from 38). The walkthrough adds three checks: the page doesn't jump on a first answer, opening someone else's private link asks first, and the demo controls start folded.
