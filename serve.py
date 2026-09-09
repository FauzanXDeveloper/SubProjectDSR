#!/usr/bin/env python3
"""Dev server for web/.

Same thing as `python3 -m http.server --directory web`, with one difference
that matters: it sends `Cache-Control: no-store`. The stock server sends NO
cache headers, so browsers heuristically cache .js for days and keep running
an old build after you edit a file - which looks exactly like "my change
didn't work".

    python3 serve.py            # http://localhost:8000
    python3 serve.py 8080       # another port, if 8000 is taken
"""
import functools
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # WebAssembly.instantiateStreaming refuses anything but application/wasm,
    # and Python's table doesn't know .wasm on every platform.
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{'.wasm': 'application/wasm'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # quiet: one line per request is noise, errors still surface below
        if not str(args[1] if len(args) > 1 else '').startswith('2'):
            super().log_message(fmt, *args)


def main():
    if not os.path.isdir(ROOT):
        sys.exit('Could not find %s - run this from the project root.' % ROOT)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer(('', PORT), handler)
    except OSError as e:
        if e.errno == 48:  # EADDRINUSE
            sys.exit(
                'Port %d is already in use - something else is serving there.\n'
                '  See what it is:  lsof -nP -iTCP:%d -sTCP:LISTEN\n'
                '  Stop it:         kill $(lsof -t -nP -iTCP:%d -sTCP:LISTEN)\n'
                '  Or use another:  python3 serve.py 8080'
                % (PORT, PORT, PORT))
        raise
    print('Serving %s at http://localhost:%d  (no-store, so edits show up on reload)'
          % (ROOT, PORT))
    print('Admin dashboard: http://localhost:%d/admin/index.html' % PORT)
    print('Ctrl-C to stop.')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
