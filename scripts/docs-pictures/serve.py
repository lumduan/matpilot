"""Serves the built site (out/) the way a static host does: /blocks answers with blocks.html.

Usage: python3 scripts/docs-pictures/serve.py out 3399
"""
import http.server, os, sys
from functools import partial

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        full = super().translate_path(path).rstrip("/")
        if os.path.isfile(full + ".html"):
            return full + ".html"
        return super().translate_path(path)
    def log_message(self, *args):
        pass

root, port = sys.argv[1], int(sys.argv[2])
http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root)).serve_forever()
