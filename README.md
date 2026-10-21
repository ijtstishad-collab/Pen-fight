# Pen Fight

A flick-pen duel on a school desk, in the browser. Flick your pen, knock the other pen off the desk, keep yours on.
Play the computer (easy / normal / hard) or a friend on the same device.

## Play

It's a static site with no build step and no dependencies:

```sh
npm start          # serves the folder on http://localhost:8080
# or: python3 -m http.server 8080
```

Opening `index.html` directly from disk also works.

## How to play

1. Press on your pen (it pulses when it's your turn).
2. Pull back to aim, like a slingshot. Pulling further hits harder; grabbing near a tip adds spin.
3. Let go to flick.

A pen falls once its middle leaves the desk. Knock the other pen off and you take the round; flick your own pen
off and you lose it, even if you took theirs with you. The first to the chosen number of rounds wins the match.

## Code

| File | What it does |
| --- | --- |
| `physics.js` | Capsule rigid-body physics: sliding friction, spin, pen-to-pen collisions, falling off the desk. |
| `ai.js` | Computer opponent: simulates candidate flicks with the same physics and plays the best one, with aim error per difficulty. |
| `game.js` | Canvas rendering, pointer input (mouse and touch), turns, rounds and scoring. Portrait screens get the desk rotated. |
| `index.html`, `style.css` | Page, menu, scoreboard and result dialog. |

`physics.js` and `ai.js` also load in Node, so the simulation is tested headlessly:

```sh
npm test
```
