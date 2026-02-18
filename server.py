import http.server
import socketserver
import json
import os

PORT = 3000
DATA_FILE = 'database.json'

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/state':
            if os.path.exists(DATA_FILE):
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'{"error": "No data found"}')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/state':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                state = json.loads(post_data.decode('utf-8'))
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(state, f, indent=2, ensure_ascii=False)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"success": true}')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), CustomHandler) as httpd:
    print(f"KandalGym Sync Server running at http://localhost:{PORT}")
    print(f"On your mobile devices, use http://192.168.1.65:{PORT}")
    httpd.serve_forever()
