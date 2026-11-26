# Freeze

A camera game for everyone in front of one laptop. A shape appears on the screen. Your group fills it with your bodies, then holds still for 3 seconds. You get points for filling the shape and for holding still. A game is 5 rounds and takes about a minute and a half.

Everyone the camera can see is on the team, so it works for 1 person or 8. Nobody has to sit out to watch or keep score, because the laptop keeps score.

This is a working prototype for the ISDN 1001 project. It hasn't been tested with real groups yet.

## Why a game like this

University students say they want to play together, but most games are hard to start:

| What stops people | How Freeze handles it |
|---|---|
| You need a full group, at the same time, in a booked place | Any number of people in front of any laptop, in a dorm, a classroom or a common room. Nothing to book. |
| There's a lot to learn, and you don't want to be the weakest player | You only have to fill the shape and hold still. There's one team score, and shapes need short and tall people, standing and crouching, so everyone has a part to fill. |
| You need to buy equipment | Students already carry a laptop with a camera. |
| You can get hurt | No ball, no running and no tackles. The game rewards holding still, bigger groups get more time, and the screen says "Slow down" if anyone runs. |

Freeze uses a laptop, not a phone, because a laptop camera on a table can see a whole group, and the screen is big enough to read from across a room. With several laptops in one room, each laptop can be a team. Every laptop that picks the same group size gets the same 5 shapes, so teams can compare scores.

## How to play

1. Pick how many of you are playing: 1 or 2, 3 to 5, or 6 or more. Bigger groups get wider shapes and more time.
2. Put the laptop on a table. Stand about 2 metres from it if there are 1 or 2 of you, about 3 metres for 3 to 5, and 3 to 4 metres for 6 or more. The camera should see all of you, at least from the waist up.
3. Choose **Learn the room**. Everyone steps out of the picture. After a 5-second countdown, Freeze takes a second or two to learn the empty room.
4. Step back in. You turn teal on the screen. Choose **Start the game**.
5. Each round: **Fill the shape** (8 seconds for 1 or 2 people, 10 for 3 to 5, 12 for 6 or more), then **Freeze!** (hold still for 3 seconds), then see your points.

On the screen, the shape is outlined in yellow. Parts of you inside the shape are teal. Parts of you outside the shape have coral stripes, and they cost points.

Press the space bar to pause, and the space bar or Escape to resume. Press M to turn the sound on or off. Freeze also pauses if you switch to another tab. After a game, you can pick a different group size and play again without learning the room again.

**Points for a round** = 100 × fit × still.

- Fit is how much of the shape you filled, minus half of what was outside it, averaged over the last 2.5 seconds of Freeze. The first half second doesn't count, so people have time to stop.
- Still is the share of those 2.5 seconds in which nobody moved much. If anyone moves, it counts, even in a big group.
- If you pause during Freeze, the 3 seconds start again when you resume.

## Run it

Browsers only allow the camera on a secure page, so pick one of these:

- **Open the file.** In Chrome or Edge, open `game/index.html` from the folder. Chrome treats files on your own laptop as secure, so the camera works. This was tested in Chromium only.
- **Run the small server.** In the `game` folder, run `node server.js`, then open http://localhost:8080. This needs Node.js 18 or later. It works in any browser. It serves only the game's files, and only this laptop can open them.
- **A secure link (https).** Any static web host works, such as GitHub Pages. There's nothing to set up on a server.

No camera, or the camera is blocked? Choose **Play with practice players**. Practice players walk in and fill the shapes, and the same vision code scores them. The practice players aren't very good at this, so a real group should do better. If Freeze is open inside another page, such as an online preview, that page may block the camera, so only the practice players work.

## How the camera part works

All of it is plain JavaScript written for this project, in `js/vision.js`. There's no machine learning model and no library, and the camera code doesn't use the network. The video stays on the laptop and isn't recorded.

1. **The empty room.** While everyone is out of the picture, Freeze averages 20 frames. That average is the room. It also measures how much each pixel flickers. If a lot of the picture changed, someone was probably still in it, and Freeze asks you to try again.
2. **Finding people.** Freeze asks for a wide (16:9) picture, so more people fit side by side. Each frame is shrunk to 160 pixels wide and compared with the room. A pixel that differs by more than the camera's normal flicker counts as a person. Two adjustments help in real rooms:
   - Laptop cameras brighten or darken the whole picture when people walk in. Freeze measures that change from the parts of the picture that were room in the last frame, so a big group covering most of the picture doesn't fool it.
   - A pixel that is the same colour as the room and 85% to 97% as bright counts as a soft shadow, not a person. Anything darker counts as a person, so grey and beige clothes in front of a pale wall still show up.
3. **Clean-up.** A pixel is kept only if most of its neighbours agree. This removes specks and fills small gaps.
4. **Fit.** The people are compared with the shape, pixel by pixel.
5. **Movement.** The picture is split into 8 strips, side by side, and Freeze compares frames in each strip. The strip with the most movement counts, so one person moving in a big group shows up. Normal swaying only changes thin lines along the edges of people, and the clean-up step removes those first, so standing with your arms out counts as holding still. While frozen, each frame is compared with the frame 0.4 seconds before it, so slow drifting adds up. Freeze looks at about 15 frames a second, skips repeated frames from slow cameras, and allows for the time between frames, so fast and slow laptops are judged the same way.
6. **Checks.** If nearly the whole picture looks like people for a second, or so little of the room is in view that Freeze can't judge the brightness, the light probably changed or the laptop moved. Freeze then pauses and asks you to learn the room again. If the camera stops, Freeze stops the game and says so.

### Known limits

- It needs a steady camera and steady light. If the laptop moves or a light turns on, learn the room again (pause, then **Learn the room again and restart**).
- Clothes the same colour as the wall can be missed. A plain wall behind the players works best.
- Even room light works best. A bright window or lamp behind the players makes them harder to see, and dark shadows on the wall can count as people.
- Someone walking behind the players counts as a player.
- If someone stays in the picture without moving while Freeze learns the room, Freeze can't tell. They become part of the room. Check that everyone is out of the picture.
- One person walking fast close to the camera can make "Slow down" appear. Freeze may also measure a group walking about the same as one person running. Before a class test, record real players walking and running, and check that the warning appears only when someone runs.
- It hasn't been tried with real groups, real rooms or many laptop models yet. The numbers in `js/vision.js` and `js/rounds.js` (how different a pixel must be, how much movement counts as moving or rushing) are first guesses to tune in a real test.

## Safety

- Clear chairs and bags from the space first.
- Shapes never need jumping or lifting anyone, and no shape has a gap so low that someone would have to lie down under it. A test checks every shape for this.
- You can play sitting down. People who are sitting can fill the low parts of shapes.
- If anyone runs while filling a shape, the screen says "Slow down. There's time."

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css` | The screens |
| `js/vision.js` | Finding people, fit and movement |
| `js/shapes.js` | The 15 shapes, which 5 shapes each group size gets, the time to fill and how far to stand |
| `js/rounds.js` | The rules: timing, points, pause |
| `js/practice.js` | The practice room and practice players |
| `js/game.js` | The camera, drawing, sound and buttons |
| `server.js` | The small local server |
| `test/` | Unit tests (`npm test`) and a browser walkthrough (`npm run e2e`) |

The walkthrough:
- plays a whole practice game at 8 times the normal speed
- checks pause (button, space bar, Escape and switching tabs), play again with a new group size, and quit
- checks that the top and bottom bars don't cover the picture
- checks the page at phone width
- starts the camera with Chromium's pretend camera
