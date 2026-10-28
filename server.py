# Tiny no-cache web server so Chrome always loads the newest game files
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
