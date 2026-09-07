# Dino 3D

**[▶ Play it](https://jack-does-trading.github.io/dino-game/)**

You know the dinosaur that shows up when your internet dies. This is that page —
the real one, down to the pixel — except when you press space the dino starts
running, the camera swings around behind it, and you are in a 3D endless runner.

<img src="icons/icon-512.png" width="120" alt="">

It opens in about the time it takes to blink. There is nothing to download,
nothing to sign up for, and no loading bar — the entire game is smaller than a
single phone photo, because every rock, canyon and dinosaur in it is drawn by
maths rather than shipped as a file.

## Keep it for when you actually lose connection

Play once and it is yours. The game quietly saves itself to your device the first
time you visit, so it works with the Wi-Fi off, on a plane, in a tunnel — which
is, after all, the entire point.

To keep it one tap away:

- **Chrome / Edge (computer)** — press **add to browser** on the game-over screen, or
  click the install icon at the right-hand end of the address bar.
- **Android** — same **add to browser** button, or menu → *Add to Home screen*.
- **iPhone / iPad** — tap **Share**, then **Add to Home Screen**.

Installed, it opens from your home screen or dock like any other app, with no
browser bars in the way.

## Actually replacing Chrome's offline page

Installing gets you the game as an app. It does **not** put it behind Chrome's
own "No internet" screen — that page is `chrome://network-error`, built by the
browser itself rather than served from the web, and no website can claim it no
matter what it installs.

Only an extension can, and this repo is one. It watches for a failed navigation
and sends the tab to the game instead, with the address you were trying to reach
carried along so **Reload** still retries the real page.

Chrome does not let extensions install from a link, so this part is manual:

1. Download this repo (green **Code** button → *Download ZIP*) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**, top right.
3. Click **Load unpacked** and choose the unzipped folder.

Now lose your connection and the dino is already 3D. The extension asks for one
permission, `webNavigation` — enough to know that a page failed to load, and
deliberately not enough to read any page you visit.

## Controls

| | |
|---|---|
| **space** or **↑** | jump |
| **←** **→** | change lane |
| **↓** | duck |
| **esc** or **P** | pause |
| **M** | mute |

On a phone: swipe left and right to change lane, tap to jump, swipe down to duck,
and tap to go again after a crash. There is a **pause** button in the corner.

One hit and the run is over, and space puts you straight back on the track — there
is no menu between dying and playing again, which is the best thing about the
original and the thing most worth keeping. Switch tabs mid-run and the game pauses
itself rather than letting the world run on without you.

## Race your friends

Crash, then hit **copy challenge link**. The link you get contains your track and
a recording of your run. Whoever opens it plays the *same* track and races your
ghost — a translucent dino running exactly the way you did — with a score that
means something because it is directly comparable.

Send someone a link like this and they are racing you:

    https://jack-does-trading.github.io/dino-game/#c=<code>

Want a specific track without the ghost? Put a seed on the end instead:
`#s=zk9q2`. The same seed always builds the same canyon.

Your best run is remembered on your device, and you race your own ghost whenever
the track matches.

## What you will see out there

The world changes as you get further, not as time passes — so reaching a new
place means you actually earned it. Desert dawn gives way to a red canyon, then a
storm, then an aurora at night. Threading a gap without hitting anything builds a
score multiplier, so playing greedy pays.

The music has no music files. It is generated as you play, and it changes key
when the landscape does.

---

Building on this, or curious how it works? See **[DEVELOPING.md](DEVELOPING.md)**.
