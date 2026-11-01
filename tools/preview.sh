#!/bin/sh
# Serves app/ for the desktop preview, with caching off so edits show on reload.
# The keyboard stands in for the remote: arrows move, Enter is OK, Esc/Backspace is Back, "i" is the Input key.
set -e
APP="$(cd "$(dirname "$0")/../app" && pwd)"
PORT="${1:-8090}"
echo "emzee preview: http://localhost:$PORT/"
echo "  test params: ?phase=dawn|day|dusk|night  ?idle=1  ?blur=0"
exec python3 -c '
import functools, http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
class S(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # the default 5 resets connections when a browser loads a dozen scripts at once
S(("127.0.0.1", int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
' "$PORT" "$APP"
