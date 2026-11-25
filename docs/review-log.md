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

## Cycle 3: prototype round 3, plus check-in (26 Nov, 00:55–01:45)

| Reviewer | Verdict before the fixes below |
|---|---|
| Design | Ready for a 5-student usability test. Three P2s about the privacy promise and a missing "ready" cue. |
| Technical | Not yet: the new "Remove" flag showed who had answered, and a phone that hadn't joined took over someone's identity from their private link without asking. Everything else solid. |
| Business | A strong direction. README almost honest. Momentum: the seats looked empty and a dead plan waited silently. Next: check-in with a typed code. |
| Feasibility | Feasible. A few README steps a first-year would get stuck on, and a few missing counters. |
| Text (app) | FAIL on 5 lines; README, rules and word list pass. |

### Fixed

| Priority | From | Finding | Change |
|---|---|---|---|
| P1 | Technical, design | "Remove" next to anyone who hadn't answered told everyone who had answered. | Only the person who made the group sees it, only for people who joined more than 2 days ago and never answered, inside "Manage members". Every refusal has the same message. Test added. |
| P2 | Technical | A phone that hadn't joined became someone else, without asking, when it opened their private link. | Always asks first, unless it's already that person. "Stay as Jason" (or "This isn't my link") is the main button. |
| P2 | Technical | With 2 people needed, a ready plan showed every total, so one person could read the other's times. | A ready plan shows only its best time. Test added. |
| P2 | Design | No visible cue when your own tap made the plan ready. | A message pops up, and a "Go to confirm" box appears under the grid. |
| P2 | Design | The private link banner came before the first answer and looked like the messages to paste in the chat. | It shows only after you answer, at the bottom, in a dashed box with only a copy button. |
| P2 | Business | The seats looked empty when people had said yes. | "Your seat is saved" when you're in. |
| P2 | Business | A plan where everyone answered and no time worked waited silently for 7 days. | "No time works yet", with a way to lower the number of people needed. |
| P3 | Technical | Waiting taps could be lost if the tab closed during a save. | When the page closes, waiting taps are sent at once. Each save has a number, so an older save never overwrites a newer one. Test added. |
| P3 | Technical | Usage counts could be inflated, and members could see them. | Each person counts once per kind per plan. Members never see the counts. |
| P3 | Technical | "Make a new private link" had no limit; a lost reply could lock you out. | 5 per hour. The old link keeps working until the new one is used. Tests added. |
| P3 | Technical | Admin token guesses weren't limited. | The server won't start with a token shorter than 32 characters. |
| P3 | Feasibility | The export couldn't measure some things. | Adds: first confirmation (kept if the plan moves), link opens before joining, people who left or were removed, refused joins with a taken name. |
| P3 | Feasibility | README steps a first-year would get stuck on. | `curl.exe` on Windows, a command to make the token, where the group id is in a plan link, a calendar reminder for deletion, a check that request limits work behind Railway. |
| P3 | Design | Deadline could land at 01:00; no arrow on folded sections. | Deadlines move to 09:00 if they'd land at night. Arrows added. |
| — | Text | 5 lines in the app. | All fixed, plus the optional ones. |
| — | Business | Small README claims. | Fixed: browser (not phone) storage, what totals show, Gollwitzer & Sheeran is about individuals, the full export list. |

### New: check-in

Built to the scope the business reviewer set. When the plan is about to start (from 30 minutes before until it ends), someone who is going taps "Show the code". Others type the 4-digit code. It changes every minute; last minute's code still works. Once 2 people have checked in, the plan counts as met, and the result says it came from check-ins. Codes are made from a per-group secret that never leaves the server, and the server limits wrong guesses to 10 a minute. The demo has "Skip to the start of the plan" and "[friend] types in the code".

A QR code for the same check-in was planned, but copying the downloaded QR library into the project was blocked by a safety check, so the typed code is the only path for now.

### Tests

57 unit and server tests pass (up from 50). The walkthrough now also covers the ready cue, the private link box after answering, the "Use this group as Mandy?" screen on a second phone, and the full demo check-in.

## Cycle 4: fresh-eyes final review (26 Nov, 01:05–01:20)

A new reviewer who had seen none of the earlier rounds used the prototype as a first-time user, with a fake clock to reach edge cases, then read the code. Verdict: well built and well tested, but not yet ready for a supervised test, because of 3 problems. The text judge passed the app's wording after a 4th round.

| Priority | Finding | Change |
|---|---|---|
| P1 | One person alone could record "You met": showing the code checked them in, and the bar was "2, or fewer if fewer were going". | Always 2 different people. Test added. |
| P1 | Dropping out in the last 2 hours was silent, and the screen said the plan would move when it couldn't. | In the last 2 hours: "Can't come anymore?" explains it's too late to move, the group sees "Someone can't come anymore. 2 people are still going.", and Minibus writes a message to send. Test added. |
| P1 | Minibus could confirm a plan for a time a few hours away, with no notifications, so nobody would see it. | Minibus only confirms or moves a plan on its own if the time is at least 12 hours away. Sooner times show "This time is soon … someone who is in needs to confirm it." Test added. |
| P2 | Someone not signed in (a private tab) saw every time's total, so a member could compare. | No totals for people who aren't signed in. The share message now says "totals, not names" instead of "nobody sees who said yes". Test added. |
| P2 | Someone who lost their place (in-app browsers) left a duplicate that stalled the plan for 48 hours. | The group maker can remove a never-answered member after 6 hours (was 2 days). A hint appears when Minibus is opened inside Instagram, WeChat and similar apps. The join screen explains what to do if you joined before. |
| P2 | "No one in charge" only half solved: every message is pasted by hand, and the join screen named who started the plan. | Share and "Open WhatsApp with this message" buttons next to Copy. The join screen no longer names the starter. |
| P2 | The first "Did you meet?" answer decided for everyone and later answers were silently ignored. | Every answer is kept; the result follows the answers; people who haven't answered can still add theirs. Test added. |
| P2 | No study plan: "compared to what?" | [`study-plan.md`](study-plan.md): baseline survey, a WhatsApp poll comparison, step-by-step measures, interviews, ethics. |
| P2 | The 200-hour bar would fill about 1.5% in a week, and Hall's number is for pairs. | Bar removed. The group page shows times met first. |
| P3 | Wording: "1 of 3 people have answered", the deadline paragraph twice, the unexplained red seat, "(2 people free)" counting you, the reminder shown to people who said no, "Beach in Sai Kung" for a 3-hour afternoon. | All fixed ("has answered", one deadline paragraph, red outline explained, others-only counts, reminder only for people who are in, "Board games"). |
| P3 | The browser walkthrough wasn't part of npm scripts. | `npm run e2e`. |

Not done: a late-night time of day (it would add a fourth column to a phone-width grid), and repeating plans that Minibus starts on a schedule.

62 tests pass (up from 57). The walkthrough passes.

## Cycle 7: last check of the pitch (26 Nov, 01:20)

A pitch coach who hadn't seen the deck before checked it against the grading items and the lecturers' rules. Verdict: meets every item; nearly ready. The one real risk was time.

| Priority | Finding | Change |
|---|---|---|
| P1 | With numbers read out in full, the script ran 2:01–2:11, not 1:50. Slide 7 had the fastest pace on the line that should be slowest. | Cut to 237 words: removed "and long commutes", the "As the day gets closer…" sentence, and shortened slides 5 and 6. New timings give slide 7 28 seconds. |
| P2 | The pitch never said "problem statement" or mentioned free time, which links it to the leisure theme. | Slide 7 now says "Problem statement: university friend groups want to spend their free time together…". |
| P2 | Missing answers for likely questions. | Added: "Is Mandy real?", "Darley and Latané studied emergencies", "What's your solution?", "Maybe people just don't want to meet?", "How was 83.7% measured?", and a note on the 86% guilt figure. |
| P3 | Checks only the student can do. | Checklist: put your name on the cover, open the HKFYG press release to confirm the numbers, check the icon and arrows in Present mode. |

Kept as they were (the coach said not to change them): the How Might We question, the opening and ending, the empathy map, and the numbers. Deck republished as version 9.

## Cycles 5 and 6: usability and accessibility (26 Nov, 01:30–02:30)

Two reviewers who hadn't seen the earlier rounds checked the prototype at the same time.

- **Usability (cycle 5).** An agent played 5 first-time students (a quick replier, a late joiner, someone who can't come, a group maker, and someone coming back after 2 days) and did real tasks in the demo and the server version. Verdict: not ready yet. The main problems were hidden rules (picking a time counted as "I'm in"), the time grid without clock times, and screens that didn't say what had changed.
- **Accessibility (cycle 6).** Keyboard only, screen reader names and announcements, contrast, and zoom to 200%. Verdict: close to WCAG 2.1 AA. The main problems were focus dropping to the top of the page after a tap, errors that only showed in a toast, and redraws that moved focus while someone was typing.

| Priority | Finding | Change |
|---|---|---|
| P1 | Tapping a time quietly counted as "I'm in". People who only wanted to look at times were counted as yes. | The grid stays off until you say if you're in. The intro says "Say you're in first." |
| P1 | After tapping a button that disappeared (like "I'm in"), focus went to the top of the page. | Focus moves to the status heading, or the page heading if there's none. On every new screen, focus starts on the heading. |
| P1 | Errors only showed in a toast that disappeared, and screen readers didn't always read them. | Errors also go to an alert region. Messages are read through a live region that is always on the page. |
| P1 | Near the start, "I can't come" couldn't be undone: the confirmed time had closed, so "Yes, I can make it" did nothing. Found by the new browser walkthrough. | The confirmed time can be added back until the plan ends. The "someone can't come" notice goes away if the same person comes back. Tests added. |
| P2 | Lunch, afternoon and evening had no clock times. | Times show clock hours everywhere: "Thu 26 Nov, evening (7–10pm)". Column headers show them too. |
| P2 | With 2 others in and 1 of them saying no, totals could show who said yes. | Totals show only once 2 others are in and 3 others have answered. Tests changed. |
| P2 | After a move, the status still said "The plan is confirmed" and the group message looked the same as before. | The heading says "The plan moved to a new time", and the group message says "New time: … (It was …)". Test added. |
| P2 | After "I can't come", the message to send was hidden below the fold. | A "You're off this plan" card comes first, with the message and a Done button. |
| P2 | Coming back after 2 days, nothing said what had changed. | A "Since you last looked" box lists new answers, confirmations and moves since your last visit on that device. |
| P2 | Someone still picking times when the plan was confirmed lost their grid. | The grid stays for them, with "Add other times you could make, in case the plan needs to move." |
| P2 | A friend's update redrew the page while someone was typing, and lost the selected budget and the text cursor. | Updates wait until you leave the field. Redraws keep radio choices and the cursor. Nothing redraws if nothing changed. |
| P2 | The seats line ("The seat with the red outline shows…") was hard to read. | "Needed: 3 people free at the same time. So far: 2." |
| P2 | Tapping a suggested place also voted for it. | Suggested places are added without a vote. Test added. |
| P3 | The plan name wasn't a heading; page titles didn't say which screen you were on. | The plan name is the page heading. Titles name the screen, like "Dinner somewhere cheap · O-camp gang · Minibus". |
| P3 | The check-in code overflowed at 320px and was read as one number. | The code shrinks on small screens and is read digit by digit. |
| P3 | Time cells and vote buttons had screen reader names that didn't start with the visible text. | Names start with what's shown ("You, 3 free", "Vote · 2"). |
| P3 | Time ranges broke across lines ("7–" / "10pm"). | They stay on one line. |
| P3 | Help text wasn't linked to fields; "How many people" didn't say to count yourself. | Help is linked with aria-describedby. "Count yourself too." The share screen says to answer the plan yourself. |

Not done: a QR code for check-in (needs your OK to add a library), and push notifications.

63 unit and server tests pass. The browser walkthrough now also checks focus on new screens, the grid waiting for "I'm in", no error alerts on a normal confirm, and "I can't come" followed by joining again.
