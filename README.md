# Pen Fight

A flick-pen duel on a school desk, in the browser. Flick your pen, knock the other pen off the desk, keep yours on.
Play the computer (easy / normal / hard) or a friend on the same device.

Pick your pen from 72 real **Fresh** ball pens in 12 lines: Icon, Icon Signature, InkForce, Pastello, Allrounder,
Emoji, Shine, Sailor, Classroom, Campus, Good Day and Sprint. Against the computer, it plays a random pen from
another line. Your choice is remembered in the browser.

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
| `index.html`, `style.css` | Page, menu, pen picker, scoreboard and result dialog. |
| `pens.js`, `assets/pens/` | Generated pen manifest and sprites (one WebP per pen, lying flat, tip pointing right). |
| `scripts/build_pens.py` | Cuts the brand artwork into those sprites and measures each pen's colour and barrel position. |

### Regenerating the pen sprites

The sprites come from the Fresh artwork zips (*10 Pen Brands*, *Fresh Pastello*, *Fresh InkForce*). Unzip them so one
folder holds `PNG/`, `Fresh Pastello/` and `Mockup/1.png`–`6.png`, then run (needs Pillow):

```sh
python3 scripts/build_pens.py path/to/that/folder
```

`physics.js` and `ai.js` also load in Node, so the simulation is tested headlessly:

```sh
npm test
```
