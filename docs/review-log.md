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

## Cycles 5 and 6: usability and accessibility (26 Nov, 01:20–01:50)

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
| P2 | After "I can't come", the message to send was hidden below the fold. | A "You're no longer going" card comes first, with the message and a Done button. |
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

Text judge on the new wording: FAIL on 7 strings in round 1, all fixed, then PASS in round 2. "Can't come" became "can't make it" everywhere, to match "Can you make it?". The panel no longer says Minibus tells the group (it can't send messages; you send it). The moved message says "Old time:" instead of brackets inside brackets. The deadline uses the same clock style as the times ("9am", not "09:00"). Skipped on purpose: showing the exact number of answers needed before totals appear, because it would hint at how many said yes.

63 unit and server tests pass. The browser walkthrough now also checks focus on new screens, the grid waiting for "I'm in", no error alerts on a normal confirm, and "I can't make it" followed by joining again.

## Cycle 8: checking the cycle 5 and 6 changes (26 Nov, 01:45–02:05)

A new reviewer read the cycles 5 and 6 code change line by line and wrote a small test script for each problem, comparing with the version before. Verdict: 5 real problems came in with that change, and the tests didn't catch any of them. All 9 findings are fixed. Every repro script was run again after the fix.

| Priority | Finding | Change |
|---|---|---|
| P1 | On iPhone, tapping "I'm in" scrolled the page past the whole time grid. Safari doesn't focus a tapped button, so the "focus was lost" fallback ran after almost every tap. "Show the code" also scrolled the code off screen. | The fallback only runs when the focused element itself disappeared, and it never scrolls. "Show the code" puts focus on the code. Headings scroll into view only if they're off screen. |
| P2 | In the demo, "See it as" didn't switch the screen until you tapped somewhere else. The menu counted as "typing", so updates waited. | Menus no longer count as typing. A new walkthrough check makes sure the times change straight away. |
| P2 | After typing in a field, the first tap on a time could be lost: the held-back update redrew the page between pressing and releasing. | The held-back update waits until the tap is over. Tapping a suggested place no longer puts the cursor in the text field. |
| P2 | In the demo, the "You're no longer going" card followed you when you switched to another person. | The card belongs to the person who tapped "I can't make it". Switching person clears it. |
| P2 | "Since you last looked" never showed for a tab left open: every live update counted as seen, even with the tab hidden. | What you've seen is saved when you hide the tab or leave the plan. Coming back to the tab shows what changed. Wording fixed to "1 more person has answered". |
| P3 | The "someone can't make it" notice cleared when one person came back, even if another was still out. After a move, it also wiped the "plan moved" notice. | Minibus keeps a private list of who dropped out. The notice clears only when all of them are back, and then the earlier notice returns. Tests added. |
| P3 | Someone who said no could join a minute before the end and decide "Did you meet?". | People who join after the start can still check in. Without a check-in, they can't answer "Did you meet?". Test added. |
| P3 | Error screens ("Can't find this plan") had no heading for focus to move to. | They do now. |
| P3 | Screen readers heard "7 dash 10pm" in announcements. | Announcements and alerts say "7 to 10pm". |

65 unit and server tests pass. The walkthrough passes.

## Cycle 9: usability re-test and visual design (26 Nov, 02:05–02:30)

Two new reviewers worked in parallel.

- **Usability re-test.** An agent ran the server version with a controllable clock, Wednesday night to Sunday, and played 5 first-time students: the group maker, a midnight replier, someone coming back after 2 days, someone dropping out an hour before, and a screen reader user. All 6 problems from cycle 5 are now fixed. Verdict: not yet ready for a class test, because of 1 new P1.
- **Visual design.** A designer looked at every screen at 390 and 320 px, in light and dark, and at 200% text. Verdict: the placard, the seat row and the plain style work and should stay. The layout broke at 200% text, and several screens buried their main button.

| Priority | Finding | Change |
|---|---|---|
| P1 | On a confirmed plan, someone who changed their times was asked again "Can you make it?". "No, I can't" took them out of the plan completely, so their other times stopped counting, and the plan later failed to move to a time that worked for everyone. | "No, I can't" (or removing the confirmed time) now means "I can't make this time" only. You stay in, your other times still count, and the screen says "You can't make this time" with "I can make it after all". If the plan moves, you're asked about the new time. Tests added. |
| P1 | At 200% text, the time grid, the placard and the one-line forms broke: words split, cells 32px wide. | On very narrow screens or with large text, each day goes on its own line above its 3 times, forms wrap, and the plan name shrinks a little instead of breaking mid-word. |
| P2 | Body text was fixed at 17px, so it didn't grow with the phone's text size. | It's set in rem now. |
| P2 | When the plan became ready, a toast covered 2 rows of the grid for 6 seconds, and a tap under it was lost. "Confirm this time now" was about 1,950px down. | No toast. The confirm box comes straight after the grid. Taps always go through the toast. |
| P2 | After tapping times, nothing said they were saved. | "Your times are saved." under the grid, also read by screen readers. |
| P2 | The grid note said totals were hidden while the same screen showed "3 people are free then". | The note shows the best time when there is one. |
| P2 | "Copy reminder" was the biggest button minutes after the plan was sent. | No reminder in the first 3 hours. Only one filled button per card. |
| P2 | After the plan went back to choosing, it showed a deadline that had already passed. | "Minibus confirms the plan as soon as enough people are free at the same time." |
| P2 | At the meetup, the check-in was below the message and calendar buttons. | Check-in comes first. Near the start, "Can't make it? Tell the group" comes straight after the time. |
| P2 | Three notice styles stacked up, and the place was shown 3 times. | One banner: "Since you last looked", then the plan's notice. The place shows on the placard and in the message only. |
| P2 | "Best" was just a slightly thicker border, and "too late" looked like "say you're in first". | The best time has a red border and the word "Best". Too-late times have no border. |
| P2 | The home page group links were 20px tall. | 44px. |
| P3 | Smaller items: no "you're not going" after "Done", old "moved" wording a day later, a crash in screen reader announcements on the join screen, "2 days" instead of "6 hours" on the group page, the starter's name on the join screen, "Budget not set", the picked idea chip not looking picked, the private link box looking like the demo controls, the leave button looking safe, wrapped link buttons left-aligned, a green focus ring on red error fields, "Anyone who is in can confirm it" missing. | All fixed. "Moved" notices show for a day. |

Not done: the time ranges still use a dash in normal text; some screen readers read it out. The grid buttons and announcements say "7 to 10pm".

Text judge on the new wording: FAIL on 2 strings in round 1 ("Every time counts" played on the word "time", and an error message still said "2 days" instead of 6 hours), then PASS in round 2.

67 unit and server tests pass. The walkthrough checks that the confirm button comes straight after the grid.

## Cycle 10: checking the cycle 9 changes (26 Nov, 02:30–02:45)

A new reviewer read the cycle 9 code change and wrote a repro script for each problem, with a fake clock and the real fonts. The new "can't make this time" rules held up: no bug found in how people are counted or how plans move. 1 P1 and 5 P2s came in with the screens, all fixed. Every repro script was run again after the fix.

| Priority | Finding | Change |
|---|---|---|
| P1 | When a save failed (no internet), the screen still said "Your times are saved", and screen readers heard it right after the error. | "Saved" only shows after a real save. A failed save shows only the error. |
| P2 | In the demo, "Your times are saved" followed you when you switched to another person. | It belongs to the person who saved. Switching person or opening a private link clears it. |
| P2 | An hour before the plan, the "can't make this time" card still said the plan could move, and at check-in it pointed to a grid that wasn't there. | Near the start it says "It's too late to move the plan to another time", and the grid is hidden. The confirmed time keeps its red outline. |
| P2 | The reminder never showed in the demo, because the demo plan is always brand new. | The demo shows it straight away. The 3-hour rule and the deadline use the server's clock. |
| P2 | The toast covered the grid at 200% text, and tapping it passed the tap to a hidden time underneath. | Tapping the toast closes it, and the tap stops there. The "plan is confirmed" and "checked in" messages are announced instead of shown, since the screen already changes. |
| P2 | "Afternoon" still split mid-word at 200% text with the real font. | At 200% text, each time gets its own full-width line with its label ("Afternoon 3–6pm"), so nothing has to split. |
| P3 | The saved and "plan is ready" announcements cut each other off. A unit test skipped its own check. Two sentences on the ready card said the same thing. The deadline-passed text left out the 12-hour rule. A code comment was garbled. Tapping a picked idea didn't unpick it. "No, I can't" did nothing if the plan had just stopped being confirmed. Long group names in the header. | All fixed. The walkthrough now taps "No, I can't" and checks the grid stays. |

Text judge: PASS in round 1. Two optional changes taken: the deadline-passed text is split into two sentences, and "This time is soon" now says "less than 12 hours away". Not taken: making what screen readers hear match the visible grid label word for word at 200% text, because the normal layout shows different words.

67 unit and server tests pass. The walkthrough passes.

## Cycle 11: docs accuracy and server security (26 Nov, 02:45–03:00)

Two new reviewers worked in parallel.

- **Docs accuracy.** A reviewer checked every claim in the READMEs and the study plan against the code. The root README was accurate. The prototype README had 6 wrong claims (for example, when the plan moves, and when a plan counts as met), 1 out-of-date privacy list, and 7 missing rules. The study plan said the export counts "can't make it" notices, which it doesn't. All fixed, then the text judge passed both files after 3 rounds.
- **Server security.** A reviewer attacked a local copy of the server with a fake clock and 16,696 random actions. Saving, static files, member keys, headers and odd input held up. It found 2 privacy leaks, 6 problems to fix before a class test, and 10 smaller ones.

| Priority | Finding | Change |
|---|---|---|
| P1 | The group maker's "Manage members" list showed who had answered. With "the plan isn't ready yet", that could show who said no. | The list offers everyone who joined more than 6 hours ago. The server still refuses to remove anyone who answered, with the same message for every refusal. |
| P1 | Any member could set the number of people needed to 2, tap one time at a time and watch for "ready", then set it back. That showed the hidden totals. Signed-out viewers could also see "ready". | The number can change only until someone else answers. After that, it can only go down, and only when everyone has answered and no time works. Signed-out viewers never see "ready". Test added. |
| P2 | Two people at home could each tap "Show the code", and the plan counted as met. | Showing the code doesn't check you in. Typing a code checks you in only if someone else showed it in the last 2 minutes, and then both of you are checked in. Test added. |
| P2 | A failed save (full disk) was only logged. People kept answering, and everything was lost on restart. | The server stops accepting changes, says so, and reports an error on `/api/health`. It tries again every 30 seconds. Test added. |
| P2 | One network could fill the server with 2,000 groups and make saves fail. | At most 200 groups, and 20 new groups per network per day. |
| P2 | The daily export couldn't be used to restore the data. | A new admin backup download, with restore steps in the README. A test restores a backup and signs in with an old private link. |
| P2 | A save numbered from a phone clock far in the future blocked all later saves without an error. | Numbers more than a minute ahead of the server are ignored. Test added. |
| P2 | The README's check for request limits couldn't tell if the limits counted each person. | A new admin address check, and README steps to try it from 2 networks. Test added. |
| P3 | All rate limits reset at once after 20,000 addresses. Check-in codes, live updates and calendar files had no limits. One address could hold all live-update slots. Link opens could be counted many times. One broken group stopped the 10-minute update for everyone. Odd input caused a few 500 errors, and so did a malformed address. The dropped-out list kept people who had left. Signed-out viewers saw who started a plan. Calendar entries carried everyone's names to Google. No HSTS header. | All fixed. Calendar entries now say "Planned with Minibus" without names. The README tells the student to mention Google Fonts and Google Calendar in the consent form. |

Not done: anyone with the group link can still join until the group has 20 members (written in the README's limits).

Text judge on the new wording: FAIL on 4 lines in round 1 (the check-in error didn't say what went wrong, the address check said to open a command on a phone, the backup text seemed to contradict itself, and the Google Calendar line left out the group name), then PASS in round 2.

74 unit and server tests pass (up from 67). The walkthrough passes. All of the reviewer's repro scripts were run again after the fix.

## Cycle 12: checking the cycle 11 changes (26 Nov, 03:00–03:20)

A new reviewer checked the cycle 11 change with two real browsers, a fake clock and a full disk. The server version held up: a real check-in updates both phones within milliseconds, the server recovers on its own 30 seconds after the disk is fixed, and the live-update counters are released properly. The demo and a few rules had problems.

| Priority | Finding | Change |
|---|---|---|
| P1 | In the demo, check-in stopped working once the code had been on screen for 2 minutes. The code timer used the phone's clock, but the demo runs on a clock moved forward to the plan. | The code refreshes by the phone's own clock in both versions. The demo's "types in the code" button shows the code again first, and only appears once you've shown it. |
| P2 | With 2 people needed, "Lower the number needed" offered 2 and always failed. | The button is hidden when it can't go lower, the box starts one lower, and a number that isn't lower gets "Choose a number lower than 3." |
| P2 | The member list offered "Remove" for everyone, but refused people who had answered. So the refusal itself showed who had answered. | The group maker can now remove anyone who joined more than 6 hours ago, whether or not they answered, and their answers are deleted. Nothing is refused, so nothing is shown. Test changed. |
| P2 | Link opens were counted once per network, so friends on the same campus Wi-Fi counted as one. | Every open counts again. The browser already counts once per visit. |
| P3 | Signed-out viewers could still tell "ready" from "stuck". Any two people who showed the code at home could check in with their own codes. Live updates never came back after the server refused one. Admin delete was blocked while saving failed. Failed create attempts used up the daily allowance. | All fixed. Each person who shows the code now gets their own code, so a typed code says whose phone it came from. Tests added. |

Not done: tests for the rate limits themselves, and for the 30-second save retry (it would make the tests slow).

Text judge on the new wording: FAIL in rounds 1 and 2, then PASS in round 3. It found that the removal text said "only the person who made the group", but if the maker leaves, the member who joined earliest takes over. All 3 places that describe the rule now say so. It also asked for "Removing someone deletes their answers" instead of "Their answers are deleted".

76 unit and server tests pass. The walkthrough passes. The reviewer's repro scripts were run again after the fix.

## Cycle 13: fresh-eyes review of the whole prototype (26 Nov, 03:20–03:36)

A new reviewer who had seen none of the earlier rounds ran a full week for a group of 5 on the server version with a fake clock (Monday to Saturday), the demo 3 ways, and read the code. Verdict: not ready for a class test yet, because of 2 P1s. Both are fixed now.

| Priority | Finding | Change |
|---|---|---|
| P1 | People could work out who said yes or no before a plan was confirmed. The join screen listed who had joined, the totals matched the number of answers, and "1 more person has answered" with unchanged totals showed a no. | The join screen no longer lists members, and signed-out viewers get no member names. Fully hiding answers isn't possible in a group of 5 while any totals are shown, so the app now says so: "In a small group, friends may still be able to guess." The README and consent form say the same. |
| P1 | If one person never answered and no time worked, the plan was stuck after 48 hours: "Lower the number needed" only appeared once everyone had answered. Setting a smaller group size said "Group size saved" but didn't change it. | After 48 hours, a plan where no time works counts as stuck, so the number needed can go down. A group size that's too low gets "This group already has 5 members…". Tests added. |
| P2 | At the deadline, Minibus confirmed a different time from the one it had shown for 2 days, because the shown time was less than 12 hours away. | Minibus only confirms on its own the time it has been showing. If that time is too soon, someone who is in confirms it. Test added. |
| P2 | Two check-ins closed check-in for everyone, even before the plan started, so the data couldn't show who came. | Check-in stays open until the plan ends. Test added. |
| P2 | "Save my times" took you off the confirmed time even if you tapped nothing, "Save" and "Keep" sounded the same, and only 4 of 11 times were offered. | The panel says "Can't make Thu 26 Nov, evening (7–10pm)?", the button says "I can't make this time", the other button says "Cancel", and every open time is listed. |
| P2 | The README said removing someone never shows who answered, but the number of answers goes down. | The README and consent form now say so. |
| P3 | "Say you're in to confirm" shown to someone who said no. "You met" shown to people who didn't go. The seats form stayed open after saving. A group of 3 never saw totals. Demo wording and the "since you last looked" box in the demo. The last-2-hours group message still said "change your times". An out-of-date code comment. | All fixed. People who didn't go see "The group met". |

80 unit and server tests pass. The walkthrough passes. The reviewer's stuck-plan and privacy scripts were run again after the fix.

Text judge on the new wording: FAIL on 2 strings in round 1 ("friends may still be able to guess" didn't say what, and a "Cancel" button in the can't-make-it panel could be read as cancelling your place), then PASS in round 2. The panel's buttons now all use "make": "I can't make this time", "I can't make any time", "I can still make it".

## Cycle 14: re-running the full week (26 Nov, 03:40–03:50)

A new reviewer re-ran the full week for a group of 5 with a fake clock, ran the demo 3 times, and checked the cycle 13 change. Most of the week worked: signed-out viewers see no names, the last-2-hours message switches on time, the move and "Did you meet?" work. Verdict: not ready yet, because of 1 privacy problem that cycle 13 introduced. Fixed now.

| Priority | Finding | Change |
|---|---|---|
| P1 | The third person to join a group of 5 saw exact totals after only 2 answers. Cycle 13's rule for groups of 3 counted the people who had joined so far, not the group size. | The rule uses the group's size. Test added. |
| P2 | After 48 hours, the reminder disappeared from the "No time works yet" card, exactly when someone hadn't answered. | The card shows how many have answered and the reminder. |
| P2 | Once 2 people had checked in, friends who arrived later couldn't check in: nobody could show the code anymore. | People who are already checked in can still show the code until the plan ends, and others can still say they can make it. Test added. |
| P2 | Anyone, even someone who said no or never answered, could lower the number needed, and that confirmed the plan straight away. | Only people who are in can lower it, and the form says that saving may confirm a time. Test added. |
| P2 | The "Can't make … ?" panel listed up to 19 full-width buttons, sorted by how many were free, with the heading off screen. | Times are small chips in date order, and focus moves to the heading. Picked times look like picked grid cells. |
| P3 | No warning about which time Minibus confirms if nobody confirms a soon one. "You met" for someone who answered "No, we didn't". The group page showed plans without dates. "Were going" before the plan had ended. The stuck card suggested lowering the number when it couldn't go lower, and adding times to people who said no. | All fixed. |

83 unit and server tests pass. The walkthrough passes. The reviewer's probe and panel scripts were run again after the fix.

Text judge on the new wording: FAIL on 2 strings in round 1 (both left out the 12-hour rule, or could be read two ways), then PASS in round 2.

## Cycle 15: a systematic privacy test (26 Nov, 03:50–04:23)

Cycles 13 and 14 both found privacy problems by hand, so this time a reviewer used a script to test every possible case. It tried every mix of who has joined and what each person answered, in groups of 3 to 6 with 2 to 4 people needed: 146,000 situations, 950,000 screens, and 2 million moments when one more person answers. For each screen, it checked whether the person looking could work out one particular friend's answer.

What worked: when totals are hidden, the screen shows nothing else about anyone's times (0 problems in 224,000 screens), and people who haven't joined never see more than members do.

| Priority | Finding | Change |
|---|---|---|
| P1 | In a group of 3, totals appeared only when both others had said yes, so totals appearing was itself the answer (24–38% of answers could be worked out). Cycle 13 added this exception. | The exception is gone: totals always need 3 other answers. A group of 3 sees the best time once the plan is ready, but not the number free at each time before then. A rerun found no answers could be worked out in groups of 3 with 3 people needed. |
| P2 | Any member could lower the group size to switch on that exception, read the totals, and set it back. | Closed by the same change. Test added. |
| P2 | The README said "in a group of 4 or 5, friends can sometimes work out who said yes". The real numbers are higher: up to about 1 in 4 answers from one screen, and when the totals change just after one more person answers, about 1 in 3 answers in a group of 4 and up to 2 in 3 in a group of 6. | The README now gives these numbers. The app says "Friends may still be able to guess your answer from the totals." The consent form line says the same. |
| P3 | After 2 check-ins, a checked-in person could still say they can't make it, so the people shown as going no longer matched "you met". | After checking in, your answer can't change. Test added. |
| P3 | The group page said "You met" to someone who was going but hadn't checked in yet. A code comment was also out of date. | Fixed. |

**A decision for you.** Friends can still guess some answers because the app shows the exact number free at each time before the plan is confirmed. You could hide those numbers until the plan is confirmed, and show only the best time once the plan is ready. That would stop most guessing. The downside: people couldn't see which times others can make, so it would be harder to find a time that works. The class test can show which matters more to real groups: privacy, or seeing the numbers. In the interview, after "Did seeing only numbers, not names, change what you answered?", ask "Would you rather see no numbers until the plan is confirmed?" (It's now in the study plan.)

84 unit and server tests pass. The walkthrough passes.

Text judge on the new wording: FAIL in rounds 1 and 2, then PASS in round 3. It pointed out that "especially in a small group" was wrong: the test showed bigger groups give away more answers, not fewer. It also asked for plainer words in this section.

## Load test (26 Nov, 04:25)

To check the server can handle a class test, a script ran 6 groups of 5 on one server at the same time. All 30 people had live updates open, and everyone answered and changed their times 8 times. Result: 510 requests in half a second, all successful. Half of them took 16 ms or less, and 95% took 109 ms or less. Every live update arrived.

## Cycle 16: a fresh final text verdict (26 Nov, 04:25–04:37)

The text judge used in every earlier round had seen each change as it happened, so a new judge who had seen nothing read all the text from scratch: every string in the app, both READMEs, the study plan, the word list, the newest review-log sections, and the pitch script and slides (checking only for real errors, because they're final for 9:00).

Round 1: FAIL on 11 short items. The slides had no errors, and every number in the docs matched the code. The main items:

- The grid note "once a few more people have answered" wasn't true for a group of 3. It now says "To make answers harder to guess, Minibus shows how many people are free at each time only once enough people have answered and said they're in. In a small group, that may not happen before the plan is confirmed." The exact rule stays in the README, not in the app, because showing it would make answers easier to guess.
- The root README said friends answer "privately". It now matches the honest privacy wording.
- The pitch's backup answer about YouGov 2023 said "most people still want to meet", but 36% isn't most. It now says "twice as many people are disappointed as pleased".
- Smaller fixes: the in-app browser hint, the "Did you meet?" totals, the drop-out message for the group chat, the "server full" error, the word list, and the writing rules list.

Round 2: PASS. Its 3 optional suggestions were also taken.

84 unit and server tests pass. The walkthrough passes.

## Cycle 17: accessibility checks on the new screens (26 Nov, 04:38)

Several screens were added or changed after the accessibility review in cycle 6, so a script checked 15 screens in light and dark mode: the home page, the start form with and without errors, join, the plan before and after "I'm in", ready, confirmed, the change-times panel, moved, "can't make this time", check-in, the code, "you met" and the group page. It looked for duplicate ids, buttons and links with no name, fields with no label, broken help links, heading jumps, more than one main heading, and touch targets under 44 px. It found no problems.

A fuller automated scan with the axe-core library was planned, but a safety check blocked running the downloaded library, the same as the QR code library earlier. It needs your OK.

## Cycle 18: final check before a class test (26 Nov, 04:40–04:52)

A new reviewer re-ran the full week for a group of 5 on the latest code, with someone who never answers, the 48-hour deadline, lowering the number needed, a move, a drop-out in the last 2 hours, 3 check-ins (one arriving after the first 2), and "Did you meet?" without check-ins. Everything worked, with no errors. It also re-ran the cycle 15 privacy script (the numbers match the README), started the server with the README's settings, and read every code change since cycle 14.

**Verdict: ready for the supervised class test**, after 2 fixes to the docs, which are now done:

| Priority | Finding | Change |
|---|---|---|
| P2 | Following the README, Railway would deploy the `main` branch, which doesn't have the prototype. | Step 2 now says to set the branch to `claude/fervent-fermi-dph6xp`, unless you've merged it into `main`. |
| P2 | The consent checklist didn't say that the researcher can see everyone's answers with their names in the data download. | Added to the checklist. |
| P3 | Lowering the number needed wasn't recorded, so the data would show the wrong reason for the confirmation. A no-show saw "You met" after the plan. The restore steps could be overwritten by a running server. Step 6 left the test group in the data. Step 7 didn't say how to find your public address. Groups of 4 can see no totals if one person stays silent. | All fixed. The export now shows when the number was lowered, and from what. The restore uses a new file name. The study plan suggests groups of 5 or 6. |

84 unit and server tests pass. The walkthrough passes.

Text judge on the new wording: FAIL on 5 one-line items in round 1 (a broken table row, an unclear "it", a restore step that left out deploying the change, "group numbers" in the consent line, and two screens that disagreed after "No, we didn't"), then PASS in round 2.

## Cycle 19: Chinese names and plan ideas (04:55)

Many students will type names, group names and plan ideas in Chinese, so a script made a group called "大學O營好朋友組合超級長的名字測試一下", a plan called "打邊爐然後去旺角行街食糖水再去唱K", and members called "陳美玲" and "黃家明 Ka Ming", on 320 px and 390 px phones. The share message, plan page and group page all showed the Chinese text correctly, and nothing scrolled sideways. Joining with a Chinese name that was already taken was refused, as it should be. The page titles were right, and there were no errors.

## Summary of the 6-hour run (26 Nov, 00:15–06:17)

- **Pitch for 9:00:** the deck and script passed the text judge and a pitch coach's review in the first 2 hours, then stayed frozen. The only later change was one backup answer in the script's Q&A, where the conclusion didn't match the numbers.
- **Prototype:** 19 review cycles by reviewers who hadn't seen the earlier work, covering design, technical, business, feasibility, usability, accessibility, visual design, security, docs accuracy, privacy, load, and Chinese text. Every P1 and P2 was fixed.
- **Final verdicts:**
  - The cycle 18 reviewer says the prototype is ready for a supervised class test.
  - A new text judge passed every string in the app and every doc.
  - 84 unit and server tests pass, and the browser walkthrough passes.
- **Still yours to decide:** see [next-steps.md](next-steps.md). The main one is whether to hide the totals until a plan is confirmed. Two tools also need your OK: a QR code library, and the axe-core accessibility scan.

## Cycle 20: the 2030 version (26 Nov, from 07:31)

Your feedback: the theme is 2030, so the solution should look further ahead. The prototype also assumed the group already knew what to do. Most meetups end up as "eat, eat, eat", and people with food limits (no spicy food, allergies), people on a budget, or people who just aren't hungry tend to stay quiet so they don't seem difficult. So the group says 是但 ("whatever") and ends up at the same dinner, or doesn't meet.

What changed:

- **A plan can start without an idea.** Leave "What's the plan?" empty, and the plan becomes "Something everyone can do".
- **What works for you, privately.** Each person can tap whether they're hungry, how much energy they have, food they can't or won't eat, and the most they want to spend. Friends don't see it, but they may guess from how the suggestions change. The list doesn't ask about religion. "No pork" and "No beef" cover most needs without asking why.
- **3 suggestions everyone can do.** Minibus picks from about 20 things to do in Hong Kong, tagged with price, food and energy. It leaves out meals that someone who is in can't eat, and anything over the lowest budget. It ranks the rest by everyone's mood, and it always tries to include one meal and one thing that isn't a meal. People tap "I'd go", or "Any of these is fine". When the plan is confirmed, the most picked one becomes the plan's name.
- **Fill from my timetable (demo).** One tap fills the time grid from a pretend class timetable. This stands in for reading a real timetable in 2030, with permission.
- **Minibus in the group chat (mock-up).** A demo screen shows Minibus as an assistant inside the group chat. It notices "we should hang out" and offers to plan it, with private answers.

90 unit and server tests pass (6 new). The walkthrough now also covers the chat mock-up, private mood and limits, picking a suggestion, and the plan taking its name.

**Checks on the 2030 version.** The text judge and a new reviewer both found the same serious problem. Only people who said yes counted toward the suggestions, so when a friend said yes and set a mood, a limit or an "I'd go", the list or its numbers changed. That showed they were in, before the protected totals appeared. The reviewer also found the list often showed that person's exact mood and spending limit.

| Priority | Finding | Change |
|---|---|---|
| P1 | The suggestions and their "would go" numbers showed who said yes. | The suggestions use the limits of everyone who has joined, so yes or no never changes them. Moods only count once 3 people have given one. The "would go" numbers follow the totals rule. Tests added. |
| P1 | When nobody was in yet, the person who made the plan had their limits used even after they said no. | Fixed by the same change. |
| P1 | The app and README said "Nobody sees who chose what" and "Nobody sees anyone else's limits or mood". | Now: "Your friends don't see your answers here… If the suggestions change right after someone fills this in, friends may guess that person's limit." The README explains how the suggestions protect privacy and what they can still hint at. |
| P2 | An "I'd go" tap could be lost after 5 old picks. Picks vanished without notice when the list changed. The chosen activity stayed after the plan went back to choosing. "Plan the same thing again" copied the placeholder name. A $50 limit never got a meal. "Food allergy" sounded like a safety promise. | All fixed. There's a new $40 campus canteen, and a note says "Check the menu yourself". |
| P3 | The page was long. "Mood" allowed only one choice. "Fill from my timetable" replaced your taps and marked 16 of 21 times as free. The chat mock-up didn't show the private message or the result. | "Where?" waits until there's something to do. The private block folds to one line when you come back. Food and energy are separate rows. The timetable adds to your taps from a busier pretend timetable. The mock-up shows the private message and the confirmed plan. |

92 unit and server tests pass. The walkthrough passes.

Text judge on the 2030 version: FAIL in round 1 (the privacy promise and 3 smaller items), FAIL in round 2 ("right after someone answers" sounded like saying yes could give a limit away), then PASS in round 3.
