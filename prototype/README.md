# Minibus

Everyone in the group chat says "we should hang out", and then nobody makes a plan. Minibus is a prototype that helps a group of friends pick a time and a place, without one person having to keep asking. It hasn't been tested with real groups yet.

The name comes from Hong Kong's red minibuses, which leave once enough seats are filled. A plan works the same way: it's confirmed once enough people in the group can make the same time.

This is a prototype for the next stage of an ISDN 1001 project at HKUST. It responds to this question from the problem pitch:

> How might we turn "we should hang out" into real meetups for university friend groups, in order to keep their friendships close?

## How it works

1. One person starts a plan and pastes a ready-made message into the group chat.
2. Each friend opens the link, types their name, and says whether they're in.
3. People who are in tap the times they're free over the next 7 days: lunch (12:30–2pm), afternoon (3–6pm) or evening (7–10pm). The grid waits until you've said you're in, so picking a time never counts as a yes by accident.
4. Anyone can suggest a place, and everyone can vote. Typing a place in votes for it; tapping one of the suggested places only adds it.
5. The plan is confirmed when enough people are free at the same time and everyone has answered. If not everyone answers, Minibus confirms it after about 48 hours (never during the night), as long as enough people are free at the same time. Minibus only confirms a time on its own if it's at least 12 hours away, because nobody gets a notification. For a sooner time, someone who is in confirms it. If everyone has answered and no time works, the plan says so, and the group can lower the number of people needed.
6. If someone can't make it anymore, they change their times instead of cancelling. If enough people can make another time at least 12 hours away, the plan moves there. If not, the group goes back to choosing a time. In the last 2 hours it's too late to move: the person taps "I can't come", the group sees how many are still going, and Minibus writes a message for them to send. If they change their mind, they can still say "I can make it" until the plan ends.
7. When the group meets, one person shows a 4-digit check-in code and the others type it in. The code changes every minute. Once 2 people have checked in, the plan counts as met.
8. If fewer than 2 people check in, the people who were going can say afterwards whether they met. Every answer is kept, and the result follows the answers. These answers are self-reported.

## How it uses the research

| What the research found | What the prototype does |
|---|---|
| In a group chat, no one is in charge of the plan (Darley & Latané, 1968). | Minibus collects answers, picks the time and writes the reminder message. Someone still has to send the messages (with Copy, Share or WhatsApp buttons), but the reminder comes from Minibus, not from them. The join screen doesn't say who started the plan. |
| People who decide when and where they'll do something are more likely to follow through (Gollwitzer & Sheeran, 2006). That research is about individuals; Minibus applies the idea to groups. | Every confirmed plan has one time. If there's no place yet, the confirmed plan asks for one. |
| People are afraid of looking too eager (Boothby et al., 2018; Liu et al., 2023). | Names aren't shown with answers until the plan is confirmed. Before that, people see how many have answered (not how many said yes). The number free at each time only shows to members, and only once 2 other people are in and 3 other people have answered, so a single "no" can't give anyone away. In a small group, totals can still hint at who said yes. |
| People say yes too easily, then feel relieved when plans are cancelled (Givi & Kirk, 2023; YouGov, 2019). | If you can't make a confirmed plan, you're asked to pick other times first, and the plan moves if enough people can make one. |
| 2 friends need about 200 hours together to become close friends (Hall, 2019). | The group page shows how many times the group met, and about how many hours that was. Plans count as met when 2 people check in, or when someone who went says so. |

## Testing it with real groups

See [`docs/study-plan.md`](../docs/study-plan.md) for a one-week study plan: who takes part, the comparison with a WhatsApp poll, what to measure, and the interview questions.

## Two versions

**The demo** ([try it](https://claude.ai/artifact/Rk1gLXmtPHwNFv97aH3E8E)) runs entirely in your browser. It keeps everything on your device and has pretend friends. Open "Demo controls" to see the plan as a different friend, make a friend answer or say they can't make it, skip to the start of the plan to try check-in, or skip to after the plan. Links don't work on other phones in this version.

**The server version** lets real friends use it on their own phones. It's one small Node.js program with no other software to install.

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd prototype
```

```bash
npm start
```

Then open http://localhost:8080.

`npm start` also prints an address for friends on the same Wi-Fi, like `http://192.168.1.20:8080`. This usually doesn't work on campus Wi-Fi, which often blocks phones from reaching each other, and the Copy buttons don't work over plain `http`. For a real test, use a host with `https` (see below).

To run the demo version instead:

```bash
MINIBUS_BACKEND=local npm start
```

Plans are saved in `prototype/data/store.json`. Delete that file to start over.

## Run a class test

Friends need to reach the server from their own phones, and the server needs to keep its data file between restarts. This guide uses Railway:

1. Sign up at railway.com with GitHub, then verify your account at railway.com/verify. New or quiet GitHub accounts may get a "Limited Trial" that can't deploy code until they're verified.
2. Create a project from this GitHub repository and set the root folder to `prototype`.
3. Add a volume mounted at `/data`.
4. Set these variables:
   - `DATA_FILE` = `/data/store.json`
   - `TRUST_PROXY` = `1`, so each person gets their own request limit
   - `ADMIN_TOKEN` = a long random password for downloading the data. It must be at least 32 characters. To make one, run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` and copy the result.
   - `MINIBUS_OPERATOR` = your name and course, like `Mandy Chan, HKUST ISDN 1001`
   - `MINIBUS_CONTACT` = how people can reach you
   - `MINIBUS_DELETE_BY` = the date you'll delete everything, like `31 Dec 2026`
5. Generate a public domain.
6. Create a test plan. Then restart the service and redeploy it once, and check that the plan is still there.
7. Check the request limits work behind Railway: on one phone, create 31 test groups within a minute. The 31st should say "Too many requests". If it doesn't, ask for help before the test.
8. Put a reminder in your calendar for the deletion date. Nothing is deleted automatically.

New accounts get a 30-day trial with US$5 of credit. After that, Railway's free plan gives US$1 of credit a month and a small volume, which may be enough for a one-week test. If not, the Hobby plan is US$5 a month. Prices change, so check railway.com/pricing before you start. Don't use hosts without a lasting disk (like Render's free plan): they delete the data file on every restart.

### Back up and download the data

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/export -o minibus-export.json
```

On Windows PowerShell, type `curl.exe` instead of `curl`.

Do this every day of the test. The export has every group, plan and answer, including private answers, so keep it safe and say so in your consent form. It includes:

- when each person first answered and last changed their answer
- when each plan was first confirmed, and why (everyone answered, 48 hours passed, or someone confirmed it), even if it moved later
- how many times each plan's link was opened
- how many people copied the share, reminder and confirmed messages, and tapped "Add to Google Calendar" (each person counts once)
- how often a plan moved or went back to choosing a time
- check-in times, and whether "met" came from check-ins or from someone saying so
- how many people left, were removed, or tried to join with a name that was taken (a sign they lost their place)

It doesn't include anyone's private link or the check-in secret. A copied message is only a sign that it was posted, not proof.

### Delete a whole group

If someone asks you to delete their group:

```bash
curl -X DELETE -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/crews/GROUP_ID
```

The group id is the part after `#crew-` in the group's link. In a plan link (`#plan-...`), it's the first part after `#plan-`, before the next `-`. Reply within 2 days. When the test ends, download a final export, delete the Railway project, and delete any copies on your own computer by the date you promised.

## Privacy

Minibus stores the name you type, the group name, the plan ideas, your answers, the times you're free, your place votes, whether you met, and when you first answered. It doesn't ask for a phone number, email or location.

- The create and join screens show a short notice. With the variables above, it says who runs the test, why, when everything is deleted, and who to contact.
- Each person can delete their name and answers with "Leave and delete my answers" on the group page. The group name and plan ideas stay until the group is deleted.
- The person who made the group can remove someone who joined more than 6 hours ago and never answered anything, for example if they lost their phone and joined again under a new name.
- The server may be outside Hong Kong. Say so in your consent form.

### Consent for a user test

Before a test, give every participant a short consent form. It should say:

- who you are and that this is for HKUST ISDN 1001
- what Minibus stores (the list above), and why: to run the plans and to check whether the app works
- that taking part is voluntary and they can leave and delete their answers at any time
- when everything will be deleted, and how to contact you
- that the data is stored on a server that may be outside Hong Kong

Only include people aged 18 or over. Ask your instructor to approve the test in writing first. Don't collect screenshots of group chats, because they include messages from people who didn't agree to take part.

## Test it

```bash
npm test
```

This runs the tests for the plan rules and the server. There's also a walkthrough that opens the app in a browser, clicks through both versions, and takes phone-size screenshots. It needs Playwright and Chromium, which aren't installed by this project:

```bash
npm run e2e
```

Screenshots go into `test/screenshots`.

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css` | The page and how it looks |
| `js/app.js` | The screens and what happens when you tap |
| `js/logic.js` | The plan rules. The demo and the server both use this file, so they always agree. |
| `js/store.js` | Saves plans on this device (demo) or on the server |
| `server.js` | The server version |
| `test/` | Tests |

## Limits

- No accounts. Your place in a group is saved in the browser you joined from. Apps like Instagram and WeChat open links in their own browser, which keeps separate data, so the same phone can lose your place. Minibus shows a hint when it's opened inside one of these apps. To use another phone or browser, copy your private link from the group page. If you lose it, join again with a slightly different name.
- No notifications. Reminders go through your group chat, by copying a message Minibus writes. If Minibus confirms a plan on its own after 48 hours, people only see it when they open the plan.
- Check-in shows a number code, not a QR code. A QR code would need an extra library.
- If nobody checks in, "Did you meet?" is self-reported.
- Times are in Hong Kong time.
- Names that look the same but use different alphabets (like a Cyrillic "а") aren't treated as the same name yet.
- The server keeps everything in one file. That's fine for a class test with a few dozen groups, not for a public launch.
