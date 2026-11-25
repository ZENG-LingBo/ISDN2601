# Minibus

Everyone in the group chat says "we should hang out", and then nobody makes a plan. Minibus is a prototype that helps a group of friends pick a time and a place, without one person having to keep asking. It hasn't been tested with real groups yet.

The name comes from Hong Kong's red minibuses, which leave once enough seats are filled. A plan works the same way: it's confirmed once enough people in the group can make the same time.

This is a prototype for the next stage of an ISDN 1001 project at HKUST. It responds to this question from the problem pitch:

> How might we turn "we should hang out" into real meetups for university friend groups, in order to keep their friendships close?

## How it works

1. One person starts a plan and pastes a ready-made message into the group chat.
2. Each friend opens the link, types their name, and says whether they're in.
3. People who are in tap the times they're free over the next 7 days: lunch (12:30–2pm), afternoon (3–6pm) or evening (7–10pm). You can't tap a time until you say you're in, so picking a time never counts as a yes by accident.
4. Anyone can suggest a place, and everyone can vote. If you type a place, it also counts as your vote. If you tap a suggested place, it's only added to the list.
5. The plan is confirmed when enough people are free at the same time and everyone has answered. If not everyone answers, Minibus waits 48 hours. Then it confirms the plan if enough people are free at the same time. If the 48 hours end at night, it waits until 9am. Minibus only confirms a time on its own if it's at least 12 hours away, because nobody gets a notification. For a time less than 12 hours away, someone who is in has to confirm it. The number of people needed can change until someone else answers. After that, it can only go down: if everyone has answered and no time works, the plan says so, and the group can lower the number. If someone still hasn't answered 3 hours after the plan is made, people who are in see a reminder they can send to the group. The demo shows it straight away.
6. If you can't make the confirmed time, tap "Can't make it? Change my times" instead of cancelling. If the plan is confirmed or moved to a time you didn't pick, Minibus asks "Can you make it?", and you can tap "No, I can't". Either way, you stay in the plan, and your other times still count. If the confirmed time no longer has enough people, the plan moves to another time that has enough people and is at least 12 hours away. If there isn't one, the group goes back to choosing a time. For 24 hours after the plan moves, a notice shows the old and new times.
7. In the 2 hours before the plan starts, it can't move. If you find out in those 2 hours that you can't make it, tap "Can't make it? Tell the group", then "I can't make it". This takes you out of the plan. The plan shows how many people are still going, and Minibus writes a message for you to send. You can tap "I can make it too" until the plan ends.
8. When the group meets, one person shows a 4-digit check-in code and the others type it in. Check-in opens 30 minutes before the plan and closes when it ends. The code changes every minute. When someone types in a code that another person showed in the last 2 minutes, they're both checked in. Each person who shows the code gets their own code, and you can't check yourself in with a code you showed. Once 2 people have checked in, the plan counts as met.
9. If fewer than 2 people check in, the people who were going can say afterwards whether they met. Every answer is kept. The plan counts as met if at least 1 person says "Yes, we met" and at least as many say yes as say no. If someone said they could make it after the plan had started, they can answer only if they checked in. These answers are self-reported.

## How it uses the research

| What the research found | What the prototype does |
|---|---|
| In a group chat, no one is in charge of the plan (Darley & Latané, 1968). | Minibus collects answers, picks the time and writes the reminder message. Someone still has to send the messages (with Copy, Share or WhatsApp buttons), but the reminder comes from Minibus, not from them. The join screen doesn't say who started the plan. |
| People who decide when and where they'll do something are more likely to follow through (Gollwitzer & Sheeran, 2006). That research is about individuals; Minibus applies the idea to groups. | Every confirmed plan has one time. If there's no place yet, the confirmed plan asks for one. |
| People are afraid of looking too eager (Boothby et al., 2018; Liu et al., 2023). | Names aren't shown with answers until the plan is confirmed. Before that, people see how many have answered (not how many said yes). The number of people free at each time only shows to members, and only once 2 other people are in and 3 other people have answered, so no one's yes stands out. Once enough people are free at one time, members also see that time and how many are free. In a small group, totals can still hint at who said yes. |
| People say yes too easily, then feel relieved when plans are cancelled (Givi & Kirk, 2023; YouGov, 2019). | If you can't make a confirmed plan, you're asked to change your times instead of cancelling. If the confirmed time no longer has enough people, the plan moves to another time that does. |
| 2 friends need about 200 hours together to become close friends (Hall, 2019). | The group page shows how many times the group met, and about how many hours that was. Plans count as met when 2 people check in, or when at least 1 person who went says "Yes, we met" and the yes answers are at least as many as the no answers. |

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

`npm start` also prints an address for friends on the same Wi-Fi, like `http://192.168.1.20:8080`. This usually doesn't work on campus Wi-Fi. Campus Wi-Fi often blocks phones from reaching each other. Over plain `http`, Copy buttons select the text instead of copying it. For a real test, use a host with `https` (see below).

To run the demo version instead:

```bash
MINIBUS_BACKEND=local npm start
```

Plans are saved in `prototype/data/store.json`. Delete that file to start over.

## Run a class test

Friends need to reach the server from their own phones, and the server needs to keep its data file between restarts. This guide uses Railway:

1. Sign up at railway.com with GitHub, then verify your account at railway.com/verify. New or rarely used GitHub accounts may get a "Limited Trial" that can't deploy code until they're verified.
2. Create a project from this GitHub repository and set the root folder to `prototype`.
3. Add a volume mounted at `/data`.
4. Set these variables:
   - `DATA_FILE` = `/data/store.json`
   - `TRUST_PROXY` = `1`, so request limits count each visitor's IP address instead of Railway's
   - `ADMIN_TOKEN` = a long random password for downloading the data. It must be at least 32 characters. To make one, run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` and copy the result.
   - `MINIBUS_OPERATOR` = your name and course, like `Mandy Chan, HKUST ISDN 1001`
   - `MINIBUS_CONTACT` = how people can reach you
   - `MINIBUS_DELETE_BY` = the date you'll delete everything, like `31 Dec 2026`
5. Generate a public domain.
6. Create a test plan. Then restart the service and redeploy it once, and check that the plan is still there.
7. Check that request limits count each visitor, not Railway. Run this command twice from a laptop: once on your phone's hotspot (mobile data) and once on Wi-Fi. Replace the token and address first:

   ```bash
   curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/ip
   ```

   `countedAs` should be a different address each time, and it should be your own public address, not a Railway one. If it's the same on both networks, ask for help before the test.
8. Put a reminder in your calendar for the deletion date. Nothing is deleted automatically.

New accounts get a 30-day trial with US$5 of credit. After that, Railway's free plan gives US$1 of credit a month and a small volume, which may be enough for a one-week test. If not, the Hobby plan is US$5 a month. Prices change, so check railway.com/pricing before you start. Don't use hosts that delete files when they restart (like Render's free plan): you would lose the data file.

### Back up and download the data

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/export -o minibus-export.json
```

On Windows PowerShell, type `curl.exe` instead of `curl`.

Do this every day of the test. The export has every group, plan and answer, including private answers, so keep it safe and say so in your consent form. It includes:

- when each person first answered and last changed their answer
- when each plan was first confirmed, and why (everyone answered, 48 hours passed, or someone confirmed it), even if it moved later
- how many times each plan's link was opened
- how many people copied the share, reminder and confirmed messages, and tapped "Add to Google Calendar" (each person counts once). Taps on Share… and "Open WhatsApp with this message" aren't counted.
- how often a plan moved or went back to choosing a time
- check-in times, and whether "met" came from check-ins or from someone saying so
- how many people left, were removed, or tried to join with a name that was taken (a sign they lost their name and answers on that phone)

It doesn't include anyone's private link or the check-in secret. A copied message is only a sign that it was posted, not proof.

The export is for reading, not for restoring. Also download a full backup every day:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/backup -o minibus-backup.json
```

The backup has everything the server needs, including check-in secrets. Private links are kept only in a scrambled form, so nobody can read them from the file, but after a restore everyone's private links still work. Keep the backup as safe as the export. To restore it, stop the service, replace `/data/store.json` with the backup file (for example, with Railway's volume file browser or a one-off shell), and start the service again.

If the server can't save (for example, the volume is full), it stops accepting changes, shows "The server can't save changes right now", and `/api/health` returns an error. It tries again every 30 seconds.

### Delete a whole group

If someone asks you to delete their group:

```bash
curl -X DELETE -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-APP.up.railway.app/api/admin/crews/GROUP_ID
```

The group id is the part after `#crew-` in the group's link. In a plan link (`#plan-...`), it's the first part after `#plan-`, before the next `-`. Reply within 2 days. When the test ends, download a final export, delete the Railway project, and delete any copies on your own computer by the date you promised.

## Privacy

Minibus stores:

- your name, the group name, the plan ideas and the places people suggest
- your answers: whether you're in, the times you're free, your place votes, and whether you said you can't make the confirmed time
- your check-in time and whether you met
- when you joined, first answered and last changed your answer
- which messages you copied

Minibus doesn't ask for a phone number, email or location.

- The create and join screens show a short notice. With the variables above, it says who runs the test, why, when everything is deleted, and who to contact.
- Each person can delete their name and answers with "Leave and delete my answers" on the group page. The group name and plan ideas stay until the group is deleted.
- The person who made the group can remove anyone who joined more than 6 hours ago, for example if they lost their phone and joined again under a new name. Removing someone deletes their answers. The Remove button shows for every member after 6 hours, whether or not they answered, so it doesn't reveal who has answered. If the person who made the group leaves, the member who joined earliest can do this instead.
- The server may be outside Hong Kong. Say so in your consent form.
- The app loads its fonts from Google Fonts, so Google sees each visitor's IP address. "Add to Google Calendar" opens Google Calendar with the plan's name, the group name, the time and the place, but not anyone's name. Say both in your consent form.

### Consent for a user test

Before a test, give every participant a short consent form. It should say:

- who you are and that this is for HKUST ISDN 1001
- what Minibus stores (the list above), and why: to run the plans and to check whether the app works
- that taking part is voluntary and they can leave and delete their answers at any time
- when everything will be deleted, and how to contact you
- that the data is stored on a server that may be outside Hong Kong
- that Google Fonts sees each visitor's IP address, and that Google Calendar sees the plan details if they add it there

Only include people aged 18 or over. Ask your instructor to approve the test in writing first. Don't collect screenshots of group chats, because they include messages from people who didn't agree to take part.

## Test it

```bash
npm test
```

This runs the tests for the plan rules and the server. There's also a walkthrough that opens the app in a browser, clicks through both versions, and takes phone-size screenshots. It needs Playwright and Chromium, which aren't installed by this project:

```bash
npm run e2e
```

Screenshots go into `test/screenshots`. The walkthrough loads Playwright from `/opt/node-tools/node_modules/playwright`. To use another copy, run `npm run e2e -- /full/path/to/node_modules/playwright`.

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

- No accounts. Minibus remembers you only in the browser you joined from. Apps like Instagram and WeChat open links in their own browser, which keeps separate data, so the same phone can lose your name and answers. Minibus shows a hint when it's opened inside one of these apps. To use another phone or browser, copy your private link from the group page. If you lose it, join again with a slightly different name.
- No notifications. Reminders go through your group chat, by copying a message Minibus writes. If Minibus confirms a plan on its own after 48 hours, people only see it when they open the plan.
- Check-in shows a number code, not a QR code. A QR code would need an extra library.
- If nobody checks in, "Did you meet?" is self-reported.
- Times are in Hong Kong time.
- Names that look the same but use different alphabets (like a Cyrillic "а") aren't treated as the same name yet.
- The server keeps everything in one file. That's fine for a class test with a few dozen groups, not for a public launch. It holds at most 200 groups, and one network can make at most 20 new groups a day. Everyone on campus Wi-Fi may count as one network, so ask a class to make their groups on mobile data.
- Anyone with the group link can join until the group has 20 members. The person who made the group (or the earliest member, if they've left) can remove members only after they've been in the group for 6 hours.
