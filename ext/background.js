// Replace Chrome's offline page with ours.
//
// This is the part a PWA cannot do. `chrome://network-error` is a browser
// internal page, not web content, so no service worker can claim it -- only the
// browser itself can hand a failed navigation somewhere else, and
// webNavigation.onErrorOccurred is where it offers to.
//
// Notably this needs NO host permissions: the event carries the tab id and the
// error, and navigating a tab to one of our OWN pages needs nothing further. So
// the extension never gains the ability to read any page you visit.

// The game is served from inside the extension, not from the web. Fetching it
// from GitHub Pages would work only while online, which is precisely never.
const GAME = chrome.runtime.getURL('index.html');

// Only errors that genuinely mean "no connection". Deliberately NOT every
// network error: ERR_NAME_NOT_RESOLVED is a typo as often as an outage, and
// hijacking a mistyped URL with a game would be obnoxious. `navigator.onLine`
// settles the ambiguous ones -- it is unreliable as proof of connectivity, but
// a false reading here costs a game screen, not correctness.
const ALWAYS = new Set([
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_NETWORK_CHANGED',
]);
const WHEN_OFFLINE = new Set([
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_NAME_RESOLUTION_FAILED',
    'net::ERR_ADDRESS_UNREACHABLE',
    'net::ERR_CONNECTION_TIMED_OUT',
    'net::ERR_PROXY_CONNECTION_FAILED',
]);

chrome.webNavigation.onErrorOccurred.addListener((d) => {
    if (d.frameId !== 0) return;                       // main frame only
    if (!/^https?:/.test(d.url)) return;               // not our business
    if (!(ALWAYS.has(d.error) || (WHEN_OFFLINE.has(d.error) && !navigator.onLine))) return;

    // Carry the page you were trying to reach, so Reload retries THAT rather
    // than reloading the game -- otherwise replacing the error page would lose
    // the one useful thing it did.
    chrome.tabs.update(d.tabId, { url: `${GAME}#retry=${encodeURIComponent(d.url)}` });
});
