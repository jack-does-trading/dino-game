// Runs before the game module, as a classic script, so it is already listening
// if main.js fails to parse or throw during import.
//
// Lives in a file rather than inline because an extension page is served under
// MV3's `script-src 'self'` content policy, which blocks inline scripts outright
// -- the same index.html has to work from https, from file://, and from
// chrome-extension://.
(function () {
    let shown = false;
    function fail(what, detail) {
        if (shown) return;
        shown = true;
        const o = document.getElementById('overlay');
        o.classList.remove('hidden');
        document.getElementById('title').textContent = 'ERROR';
        document.getElementById('sub').innerHTML =
            '<div style="max-width:70ch;text-align:left;white-space:pre-wrap;font-size:12px">'
            + what + '\n' + detail + '</div>';
    }
    addEventListener('error', (e) => fail(e.message,
        (e.error && e.error.stack) || (e.filename + ':' + e.lineno)));
    addEventListener('unhandledrejection', (e) => fail('Unhandled rejection',
        (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)));
})();

// An offline page that needs a connection to load is only half the joke.
// Registered after load so it never competes with the first frame, and guarded:
// service workers need a secure context, and an extension page is not allowed to
// register one at all. Both should still play, so failure here is not fatal.
if ('serviceWorker' in navigator && !location.protocol.startsWith('chrome-extension')) {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
