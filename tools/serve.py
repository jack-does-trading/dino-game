#!/usr/bin/env python3
"""Static server for local dev. Identical to http.server except that it sends
no-store, because the browser caching index.html across edits produced a page
that was half old markup and half new JS -- a confusing failure to debug."""
import functools, http.server, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.HTTPServer(('', port), Handler).serve_forever()
