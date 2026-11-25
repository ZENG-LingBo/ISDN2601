# Minibus

Everyone in the group chat says "we should hang out", and then nobody makes a plan. Minibus helps a group of friends pick a time and a place, so the plan actually happens and nobody has to keep asking.

The name comes from Hong Kong's red minibuses, which leave once enough seats are filled. A plan works the same way: it's confirmed once enough people in the group can make the same time.

This is a prototype for the next stage of an ISDN 1001 project at HKUST. It answers this question from the problem pitch:

> How might we turn "we should hang out" into real meetups for university friend groups, in order to keep their friendships close?

## How it works

1. One person starts a plan and pastes a ready-made message into the group chat.
2. Each friend opens the link, types their name, and says whether they're going. Other people only see how many said yes, not who, until the plan is confirmed.
3. Everyone taps the times they're free over the next 7 days: lunch, afternoon or evening.
4. Anyone can suggest a place, and everyone can vote.
5. The plan is confirmed once everyone has answered and enough people are free at the same time. Anyone who is in can also confirm it earlier.
6. If someone can't make it anymore, they change their times instead of cancelling. The plan moves to the next best time, or goes back to choosing a time.
7. Afterwards, the group says whether they met. Plans that happened add to the group's hours together.

## How it uses the research

| What the research found | What the prototype does |
|---|---|
| In a group chat, nobody owns the plan (Darley & Latané, 1968). | The app collects answers, picks the time and writes the reminder messages, so no one person has to. |
| "Soon" is not a plan. Plans with a set time and place are much more likely to happen (Gollwitzer & Sheeran, 2006). | Every plan ends with one time and one place. |
| People are afraid of looking too eager (Boothby et al., 2018; Liu et al., 2023). | Answers stay private until the plan is confirmed. The reminder message says it comes from the app. |
| People say yes too easily, then feel relieved when plans are cancelled (Givi & Kirk, 2023; YouGov, 2019). | You can't just drop out of a confirmed plan; you're asked to change your times first. |
| Close friendships take about 200 hours together (Hall, 2019). | The group page counts hours together from plans that actually happened. |

## Two versions

**The demo** runs entirely in your browser. It keeps everything on your device and has pretend friends you can control, so you can try the whole flow alone. To play 2 people at once, open the same plan in a second tab and join with a different name. Links don't work on other phones in this version.

**The server version** lets real friends use it on their own phones. It's one small Node.js program with no other software to install.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd prototype
```

```bash
npm start
```

Then open http://localhost:8080. Friends on the same Wi-Fi can use the address that `npm start` prints, like `http://192.168.1.20:8080`.

To run the demo version locally instead:

```bash
MINIBUS_BACKEND=local npm start
```

Plans are saved in `prototype/data/store.json`. Delete that file to start over.

## Test it

```bash
npm test
```

This runs the tests for the plan rules and the server. There's also a walkthrough that opens the app in a browser and clicks through both versions, taking phone-size screenshots. It needs Playwright and Chromium, which aren't installed by this project:

```bash
node test/e2e.mjs screenshots
```

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

- No accounts. Your name in a group is tied to the browser you joined from. If you clear your browser data or switch phones, you'll need to join again with a new name.
- No notifications. Reminders go through your group chat, by copying a message the app writes.
- Times are in Hong Kong time.
- The server keeps everything in one file. That's fine for a class test with a few dozen groups, not for a public launch.
