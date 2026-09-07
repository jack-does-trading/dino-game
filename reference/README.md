# reference/

Ground truth for the intro. The game's first screen is not a lookalike of
Chrome's offline error page -- it is meant to be that page, pixel for pixel,
including how it reflows at every size. This directory is what that claim is
checked against.

## neterror/

Chromium's real error page, assembled from upstream sources so it can be
screenshotted and measured. `chrome://network-error/` itself cannot be captured:
the browser refuses to screenshot its own error pages, and the extension APIs
report "Frame with ID 0 is showing error page".

Fetched verbatim from `chromium/src` at `refs/heads/main`:

| file | upstream path |
|---|---|
| `interstitial_core.css` | `components/security_interstitials/core/common/resources/` |
| `interstitial_common.css` | `components/security_interstitials/core/common/resources/` |
| `neterror.css` | `components/neterror/resources/` |
| `*-offline-sprite.png`, `images/` | `components/neterror/resources/images/` |

(`<if expr>` build directives stripped -- they are not valid CSS.) `index.html`
reconstructs the DOM the page's JS builds, and blits the standing T-rex out of
the 1x sprite the way `Runner` does: source (848, 2), 44x47, drawn at canvas
y 93 = 150 - 47 - BOTTOM_PAD.

Chromium is BSD-licensed; these files are third-party and are here for
verification only. Nothing under `src/` or `index.html` loads them.

## measure.html

Loads a page in an iframe and dumps every element's rect and computed style as
text, so `--dump-dom` can read it. Driven by `tools/layout-diff.sh`.

## Running the check

    npm run serve &
    tools/layout-diff.sh

The only expected difference is `.nav-wrapper`'s width at short viewports: the
reference scrolls the document and loses the classic scrollbar's width, which is
0 on platforms with overlay scrollbars.
