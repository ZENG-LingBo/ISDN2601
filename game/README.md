# Freeze

A camera game for everyone in front of one laptop. A shape appears on the screen. Your group fills it with your bodies in 8 seconds, then holds still for 3 seconds. You get points for filling the shape and for holding still. A game is 5 rounds and takes about 1 minute 15 seconds.

Everyone the camera can see is on the team, so it works for 1 person or 8. Nobody has to sit out to watch or keep score, because the laptop keeps score.

This is a working prototype for the ISDN 1001 project. It hasn't been tested with real groups yet.

## Why a game like this

University students say they want to play together, but most games are hard to start:

| What stops people | How Freeze handles it |
|---|---|
| You need a full group, at the same time, in a booked place | Any number of people in front of any laptop, in a dorm, a classroom or a common room. Nothing to book. |
| There's a lot to learn, and you don't want to be the weakest player | The only rule is to fill the shape. There's one team score, and shapes need short and tall people, standing and crouching, so nobody's body is the wrong one. |
| You need to buy equipment | Students already carry a laptop with a camera. |
| You can get hurt | No ball, no running and no tackles. The game rewards holding still, and it shows "Slow down" if people rush. |

Freeze uses a laptop, not a phone, because a laptop camera on a table can see a whole group, and everyone can read the screen from 2 metres away. With several laptops in one room, each laptop can be a team. Every laptop that picks the same group size gets the same 5 shapes, so teams can compare scores.

## How to play

1. Pick how many of you are playing: 1 or 2, 3 to 5, or 6 or more. Bigger groups get wider shapes.
2. Put the laptop on a table, about 2 metres from where you'll stand, so the camera can see all of you, at least from the waist up.
3. Choose **Learn the room**. Everyone steps out of the picture. After a 5-second countdown, Freeze takes about 1 second to learn the empty room.
4. Step back in. You turn teal on the screen. Choose **Start the game**.
5. Each round: **Fill the shape** (8 seconds), then **Freeze!** (hold still for 3 seconds), then see your points.

On the screen, the shape is outlined in yellow. Parts of you inside the shape are teal. Parts of you outside the shape have coral stripes, and they cost points.

Press the space bar to pause. Press M to turn the sound on or off.

**Points for a round** = 100 × fit × still.

- Fit is how much of the shape you filled, minus half of what was outside it, averaged over the last 2.5 seconds of Freeze. The first half second doesn't count, so people have time to stop.
- Still is the share of those 2.5 seconds in which the group held still.

## Run it

Browsers only allow the camera on a secure page, so pick one of these:

- **Open the file.** In Chrome or Edge, open `game/index.html` from the folder. Chrome treats files on your own laptop as secure, so the camera works. This was tested in Chromium only.
- **Run the small server.** In the `game` folder, run `node server.js`, then open http://localhost:8080. This needs Node.js 18 or later. It works in any browser and only serves the game's files, to this laptop only.
- **A secure link (https).** Any static web host works, such as GitHub Pages. There's nothing to set up on a server.

No camera, or the camera is blocked? Choose **Try it without a camera**. Pretend players walk in and fill the shapes, and the same vision code scores them. The practice players aren't very good at this, so a real group should do better. If Freeze is open inside another page, such as an online preview, that page may block the camera, so only practice mode works.

## How the camera part works

All of it is plain JavaScript written for this project, in `js/vision.js`. There's no machine learning model, no library and no network. The video stays on the laptop and isn't recorded.

1. **The empty room.** While everyone is out of the picture, Freeze averages 20 frames. That average is the room. It also measures how much each pixel flickers. If a lot of the picture changed, someone was probably still in it, and Freeze asks you to try again.
2. **Finding people.** Each frame is shrunk to 160 pixels wide and compared with the room. A pixel that differs by more than the camera's normal flicker counts as a person. Two adjustments help in real rooms: laptop cameras brighten or darken the whole picture when people walk in, so Freeze measures that change and allows for it; and a soft shadow (same colour as the wall, a bit darker) doesn't count as a person.
3. **Clean-up.** A pixel is kept only if most of its neighbours agree. This removes specks and fills small gaps.
4. **Fit.** The people are compared with the shape, pixel by pixel.
5. **Movement.** Two frames in a row are compared. The share of the people's pixels that changed is the movement, so one person and eight people are judged the same way. Freeze looks at about 15 frames a second on every laptop, so movement is judged the same on fast and slow laptops.

### Known limits

- It needs a steady camera and steady light. If the laptop moves or a light turns on, learn the room again (pause, then **Learn the room again and restart**).
- Clothes the same colour as the wall can be missed. A plain wall behind the players works best.
- Someone walking behind the players counts as a player.
- It hasn't been tried with real groups, real rooms or many laptop models yet. The numbers in `js/vision.js` and `js/rounds.js` (how different a pixel must be, how much movement counts) are first guesses to tune in a real test.

## Safety

- Clear chairs and bags from the space first.
- Shapes never need jumping or lifting anyone. Crouching is the lowest pose.
- You can play sitting down. People who are sitting can fill the low parts of shapes.
- If the group rushes while filling a shape, the screen says "Slow down. There's time."

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css` | The screens |
| `js/vision.js` | Finding people, fit and movement |
| `js/shapes.js` | The 15 shapes and which 5 each group size gets |
| `js/rounds.js` | The rules: timing, points, pause |
| `js/practice.js` | The pretend room and players for practice mode |
| `js/game.js` | The camera, drawing, sound and buttons |
| `server.js` | The small local server |
| `test/` | Unit tests (`npm test`) and a browser walkthrough (`npm run e2e`) |

The walkthrough plays a whole practice game at 8 times the normal speed, checks pause, play again and quit, checks the page at phone width, and starts the camera with Chromium's pretend camera.
