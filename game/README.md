# Freeze

Party games for everyone in front of one laptop. The laptop sees your bodies, counts the players and keeps score. In every round, you do what the screen says, then freeze for 3 seconds.

- **Shapes:** fill a shape on the screen with your bodies.
- **Hands up:** show exactly the right number of hands, for example "Show 7 hands".
- **Copy the pose:** everyone copies the pose on the screen, such as "Both arms up" or "Hands on your head".
- **Mix:** a bit of each.

Everyone the camera can see is on the team, from 1 person to 6. Nobody has to sit out to watch or keep score, because the laptop keeps score. A game is 5 rounds and takes about 1 to 1.5 minutes.

Try it at https://isdn1001.lbzeng.com/freeze/.

This is a working prototype for the ISDN 1001 project. Playing with practice players has been tested here. **The body tracking with a real camera hasn't been tested yet.** See "What still needs testing" below.

## Why a game like this

University students say they want to play together, but most games are hard to start:

| What stops people | How Freeze handles it |
|---|---|
| You need a full group, at the same time, in a booked place | 1 to 6 people in front of any laptop, in a dorm, a classroom or a common room. There's nothing to book or set up, because Freeze counts the players by itself. |
| There's a lot to learn, and you don't want to be the weakest player | Each game has one rule. There's one team score, and the shapes need short and tall people, standing and crouching, so everyone has a part to fill. |
| You need to buy equipment | Students already carry a laptop with a camera. |
| You can get hurt | No ball, no running and no tackles. The game rewards holding still, and the screen says "Slow down" if anyone runs. |

Freeze uses a laptop, not a phone, because a laptop camera on a table can see a whole group, and the screen is big enough to read from across a room. A host voice also reads out each round, so players don't have to read the screen from 3 metres away. With several laptops in one room, each laptop can be a team. Laptops that play the same game with the same number of players get the same rounds, so teams can compare scores.

## How to play

1. Open Freeze and choose **Start the camera**. Allow the camera when your browser asks.
2. Put the laptop on a table and stand back: about 2 metres for 1 or 2 players, about 3 metres for 3 to 5, and 3 to 4 metres for 6. Each player gets a name tag, P1, P2 and so on, and the screen shows how many players Freeze can see. Freeze can see up to 6 players.
3. Pick a game and choose **Start the game**.
4. Each round: do what the screen says, then **Freeze!** Hold still for 3 seconds. Then see your points.

During a round you can see what Freeze sees: a line along each player's arms, a yellow ring on every hand that counts as up in Hands up, and a ring round each head in Copy the pose (solid teal when that player has the pose, dashed coral when not). In Shapes, the shape is outlined in yellow, the parts of you inside it are teal, and the parts outside it have coral stripes.

Press the space bar to pause, and the space bar or Escape to resume. Press M to turn the sound and the voice on or off. Freeze also pauses if you switch to another tab.

### Points

Points for a round = 100 × how well you did × how still you held.

- **How well you did** is averaged over the last 2.5 of the 3 seconds you hold still. The first half second doesn't count, so people have time to stop.
  - Shapes: how much of the shape you filled, minus half of what was outside it.
  - Hands up: exactly the right number of hands scores full marks, and one off scores half.
  - Copy the pose: the share of players who have the pose.
- **How still you held** is the share of those 2.5 seconds in which nobody moved much. If any one player moves, that moment doesn't count as still.
- If you pause while you're holding still, the 3 seconds start again when you resume.

Time to do it: Shapes 8, 10 or 12 seconds (more for bigger groups), Hands up 6 seconds, Copy the pose 5 seconds.

## How the camera part works

Freeze uses Google's MediaPipe Pose Landmarker, a small AI model that finds people in a camera picture. It runs in the browser on this laptop. The video isn't recorded or sent anywhere. The first time you start the camera, the browser downloads the MediaPipe code from jsDelivr and the model (about 6 MB) from Google, then keeps them.

For each player in view, up to 6, the model gives:
- **33 body points**, such as the nose, shoulders, elbows, wrists and hips. Hands up and Copy the pose use these.
- **An outline of the body.** Shapes uses this.

Freeze then works out the rest itself, in plain JavaScript (`js/pose.js` and `js/vision.js`):
- **Players** are poses with both shoulders visible, listed left to right.
- **Body size** is the distance from shoulders to hips. Arm positions and movement are measured in body sizes, so players near the camera and far from it are judged the same way.
- **A hand is up** when the wrist is above the nose.
- **Poses:**
  - Both arms up: both wrists well above the head.
  - Arms crossed: each wrist has crossed the middle of the body at chest height.
  - Right or left hand up: one wrist well above the head and the other arm down.
  - Hands on your head: both wrists at head height and close to the head.

  Every pose fits in the space a standing person takes, so big groups don't need more room.
- **Holding still:** while frozen, Freeze compares each moment with the moment 0.4 seconds before. If any player's head, shoulders, elbows, wrists or hips moved more than 0.15 of a body size, that moment doesn't count as still.
- **Running:** if any player crosses the room faster than 3.5 body sizes a second for 0.4 seconds, the screen says "Slow down. There's time." Waving arms doesn't count.
- **Shapes:** the body outlines are compared with the shape, pixel by pixel.

There's no "learn the room" step and no need for a plain wall. The model is made for ordinary rooms and light, but this hasn't been tested here yet. Keep the laptop still, because moving it looks like everyone moving.

## What still needs testing

The body tracking hasn't been tried with a real camera here. The test browser here was only allowed to run Freeze's own code, not code downloaded from other sites, and its pretend camera has no people in it anyway. Before a class test, try it on a laptop:

1. Start the camera with 1 person, then 3 to 4 people. Check that everyone gets a name tag, and that the count is right.
2. Play Hands up and Copy the pose. Check that raised hands get a yellow ring, and that each pose turns the head rings teal.
3. Stand still while frozen, then sway gently, then step to one side. Only the step should cost points.
4. While a shape is being filled, walk across the room, then run. "Slow down" should appear only for running.
5. If any of these is wrong, the numbers to change are in `js/pose.js` (how poses are judged) and `js/rounds.js` (`MOVE_LIMIT` and `RUSH_LIMIT`).

## Run it

The easiest way is the project website: open https://isdn1001.lbzeng.com/freeze/ in Chrome or Edge on a laptop.

Browsers only allow the camera on a secure page. To run Freeze from your own copy, pick one of these:

- **Open the file.** Open `game/index.html` in Chrome or Edge. Chrome treats files on your own laptop as secure, so the camera works. So far this has only been tried in Chromium.
- **Run the small server.** In the `game` folder, run `node server.js`, then open http://localhost:8080. This needs Node.js 18 or later. It serves only the game's files, and only this laptop can open them.
- **Put it on a web host.** Upload the `game` folder to any host that uses https. Freeze doesn't need any server code.

Each way needs an internet connection the first time, to download the body-tracking model.

No camera, or no internet? Choose **Play with practice players**. Practice players stand in a pretend room and play every game, and Freeze scores them the same way. You can pick 2, 4 or 6 practice players. They aren't very good at this, so a real group should do better. If Freeze is open inside another page, such as an online preview, that page may block the camera, so only the practice players work.

## Safety

- Clear chairs and bags from the space first.
- Shapes never need jumping or lifting anyone, and no shape has a gap so low that someone would have to lie down under it. A test checks every shape for this.
- You can play sitting down. People who are sitting can fill the low parts of shapes, and can do every pose.
- If anyone runs, the screen says "Slow down. There's time."

## Files

| File | What it does |
|---|---|
| `index.html`, `styles.css` | The screens |
| `js/sensing.js` | Runs the body-tracking model on the camera picture |
| `js/pose.js` | Reads poses: players, hands up, the pose cards, movement and speed |
| `js/vision.js` | Body outlines: shrinking, cleaning up and comparing with a shape |
| `js/shapes.js` | The 15 shapes, which 5 shapes each group size gets, the time to fill and how far to stand |
| `js/rounds.js` | The rules: the games, timing, points and pause |
| `js/practice.js` | The practice room and practice players |
| `js/game.js` | The camera, drawing, sound, the host's voice and the buttons |
| `server.js` | The small local server |
| `test/` | Unit tests (`npm test`) and a browser walkthrough (`npm run e2e`) |

The walkthrough:
- plays every game with practice players at 8 times the normal speed, including 6 practice players
- checks pause (button, space bar, Escape and switching tabs), play again, choose another game and quit
- checks that the top and bottom bars don't cover the picture
- checks that the start screen and the Who's playing screen fit at phone width
- starts the camera with Chromium's pretend camera, with the model's servers blocked, and checks that the screen explains the problem
