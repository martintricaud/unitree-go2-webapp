import sys
import os

if getattr(sys, 'frozen', False):
    # Running as a PyInstaller bundle — ensure bundled packages are importable
    sys.path.insert(0, sys._MEIPASS)

import logging
import threading
import webbrowser
from pathlib import Path
import uvicorn
from fastapi.staticfiles import StaticFiles
from main import app

if getattr(sys, 'frozen', False):
    # Serve the bundled frontend when running as a standalone app.
    # In dev mode, serve the frontend separately via Vite.
    frontend_path = os.path.join(sys._MEIPASS, 'frontend')
    if os.path.isdir(frontend_path):
        app.mount('/', StaticFiles(directory=frontend_path, html=True), name='frontend')

# A double-clicked app shows no terminal, so the relay's log also goes to a file
# (open it with Console.app).
LOG_FILE = Path.home() / 'Library' / 'Logs' / 'unitree-go2' / 'relay.log'
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_FILE)],
)

if __name__ == '__main__':
    threading.Timer(1.5, lambda: webbrowser.open('http://localhost:8000')).start()
    uvicorn.run(app, host='localhost', port=8000, log_level='info')
