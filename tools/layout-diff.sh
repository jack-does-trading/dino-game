#!/usr/bin/env bash
# Assert that our offline intro lays out identically to Chrome's real neterror
# page, at every breakpoint Chrome's own stylesheets define.
#
#   npm run serve &        # must be running on :8000
#   tools/layout-diff.sh              # follows the OS colour scheme
#   SCHEME=light tools/layout-diff.sh # force the light palette
#   SCHEME=dark  tools/layout-diff.sh
#
# Compares getBoundingClientRect + computed styles for every element of the page
# against reference/neterror/, which is Chromium's page assembled from upstream
# sources. Any diff is a real divergence -- except .nav-wrapper's width in the
# short-viewport cases, where the reference scrolls the document and loses the
# classic-scrollbar width. That is 0 on platforms with overlay scrollbars.
set -u
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
BASE=${BASE:-http://localhost:8000}
# preferredColorScheme: 0 = dark, 1 = light. Chrome otherwise follows the OS,
# which makes a scheme-specific regression easy to miss on a dark-mode machine.
case "${SCHEME:-}" in
  light) SCHEME_FLAG=--blink-settings=preferredColorScheme=1 ;;
  dark)  SCHEME_FLAG=--blink-settings=preferredColorScheme=0 ;;
  *)     SCHEME_FLAG= ;;
esac

SEL='h1|%23suggestions-list|ul|li|.error-code|.nav-wrapper|button|.icon-offline|.interstitial-wrapper|.runner-container|%23main-content|%23main-message'

run() {  # run <page> <WxH>
  "$CHROME" --headless=new --disable-gpu --no-sandbox --window-size="$2" \
    --virtual-time-budget=3000 --incognito ${SCHEME_FLAG:+"$SCHEME_FLAG"} \
    --dump-dom "$BASE/reference/measure.html?u=$1&s=$SEL" 2>/dev/null |
    sed -n '/id="out"/,/<\/pre>/p' | sed 's/<[^>]*>//g'
}

SIZES=${SIZES:-"1512,940 1400,1000 1200,900 1024,768 900,700 771,672 640,600
                500,900 430,930 420,760 393,852 380,760 360,480 700,380
                900,420 320,760 280,650 1200,320 480,320 1600,1200 240,600 1000,560"}
ok=0; bad=0
for sz in $SIZES; do
  if diff -q <(run "reference/neterror/index.html" "$sz") <(run "index.html" "$sz") >/dev/null; then
    ok=$((ok + 1)); echo "  $sz  identical"
  else
    bad=$((bad + 1)); echo "  $sz  DIFF"
    diff <(run "reference/neterror/index.html" "$sz") <(run "index.html" "$sz") | sed 's/^/    /'
  fi
done
echo "$ok identical, $bad differing"
[ "$bad" -eq 0 ]
