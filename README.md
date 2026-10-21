# Pen Fight

A flick-pen duel on a school desk, in the browser. Flick your pen, knock the other pen off the desk, keep yours on.
Play the computer (easy / normal / hard) or a friend on the same device.

The desk and pens are rendered in 3D (three.js): each pen is a modelled barrel wrapped in its real artwork, with its
clip, lighting and shadows, and knocked-off pens tumble to the floor. Browsers without WebGL get the flat 2D view,
which you can also force with `?2d` on the URL.

During play the camera frames the desk tightly; when a pen falls it pulls back to show it land, then moves in again.

**Watch an ad to revive.** When your pen gets knocked off, the result card offers a revive (once per round). It plays
a Fresh Stationery commercial from [youtube.com/@freshstationery1296](https://www.youtube.com/@freshstationery1296);
after you have actually watched 30% of it (skipping ahead doesn't count) you can claim the revive. The round result
is undone, the fallen pen goes back where it was before the last flick and play continues. Leaving early gives no
reward; if an ad won't load or stalls you can try another. The ad list is `VIDEOS` in `ads.js` and the threshold is
`REWARD_SHARE`.

Pick your pen from 72 real **Fresh** ball pens in 12 lines: Icon, Icon Signature, InkForce, Pastello, Allrounder,
Emoji, Shine, Sailor, Classroom, Campus, Good Day and Sprint. Against the computer, it plays a random pen from
another line. Your choice is remembered in the browser.

## Play

It's a static site with no build step and no dependencies:

```sh
npm start          # serves the folder on http://localhost:8080
# or: python3 -m http.server 8080
```

Opening `index.html` directly from disk also works, but serve it over http(s) for the YouTube ads to play.

### Presenting

- Use the ⛶ button for full screen. On phones, "Add to Home Screen" opens it full screen too.
- The menu runs side by side on wide screens and stacked on phones; portrait phones look along the desk.
- `og.png` is the link preview image. Social sites need absolute URLs, so set `og:image` to the full URL once hosted.

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
| `game.js` | Pointer input (mouse and touch), turns, rounds, scoring, the aim overlay and the 2D fallback view. |
| `ads.js` | Rewarded ads: YouTube player dialog, watched-time tracking and the 30% unlock. |
| `render3d.js` | 3D view: desk, lighting, pen models built from the sprites, falling pens, and the camera fit (portrait screens look along the desk). |
| `vendor/three.min.js` | three.js r149 (MIT), bundled so the game needs no build step or network. |
| `index.html`, `style.css` | Page, menu, pen picker, scoreboard and result dialog. |
| `pens.js`, `assets/pens/` | Generated pen manifest and sprites (one WebP per pen, lying flat, tip pointing right). |
| `scripts/build_pens.py` | Cuts the brand artwork into those sprites and measures each pen's colour, barrel position and clip. |

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
