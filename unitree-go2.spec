# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

# The release version, such as "v4", which build.sh passes. It is part of the app's name and
# identifier, so that several versions can sit side by side in Applications.
VERSION = os.environ['GO2_VERSION']

SCRIPT_DIR   = Path(SPECPATH)
BACKEND_DIR  = SCRIPT_DIR / 'backend'
FRONTEND_DIR = SCRIPT_DIR / 'unitree-go2-gui' / 'dist'
VENV_SITE    = BACKEND_DIR / 'venv' / 'lib' / 'python3.12' / 'site-packages'

a = Analysis(
    [str(BACKEND_DIR / 'launcher.py')],
    pathex=[
        str(BACKEND_DIR),
        str(BACKEND_DIR / 'go2_webrtc_connect'),
        # The driver's patched aioice fork, which its __init__ puts on sys.path at runtime.
        # PyInstaller does not run that code, so without this it bundles the unpatched venv copy.
        str(BACKEND_DIR / 'go2_webrtc_connect' / 'libs' / 'aioice' / 'src'),
    ],
    binaries=[
        # wasmtime loads its native library via ctypes using a platform-specific
        # subdirectory path; PyInstaller misses it, so we bundle it explicitly.
        (str(VENV_SITE / 'wasmtime' / 'darwin-aarch64' / '_libwasmtime.dylib'),
         'wasmtime/darwin-aarch64'),
    ],
    datas=[
        # Serve the pre-built Svelte frontend as static files
        (str(FRONTEND_DIR), 'frontend'),
        # Local WebRTC driver (not installed as a wheel, lives in the repo)
        (str(BACKEND_DIR / 'go2_webrtc_connect' / 'go2_webrtc_driver'),
         'go2_webrtc_driver'),
    ],
    hiddenimports=[
        # ── local driver submodules ────────────────────────────────────────────
        'go2_webrtc_driver',
        'go2_webrtc_driver.webrtc_driver',
        'go2_webrtc_driver.constants',
        'go2_webrtc_driver.encryption',
        'go2_webrtc_driver.util',
        'go2_webrtc_driver.webrtc_audio',
        'go2_webrtc_driver.webrtc_audiohub',
        'go2_webrtc_driver.webrtc_video',
        'go2_webrtc_driver.webrtc_datachannel',
        'go2_webrtc_driver.multicast_scanner',
        'go2_webrtc_driver.unitree_auth',
        'go2_webrtc_driver.lidar.lidar_decoder_libvoxel',
        'go2_webrtc_driver.lidar.lidar_decoder_native',
        'go2_webrtc_driver.lidar.lidar_decoder_unified',
        'go2_webrtc_driver.msgs.pub_sub',
        'go2_webrtc_driver.msgs.error_handler',
        'go2_webrtc_driver.msgs.heartbeat',
        'go2_webrtc_driver.msgs.rtc_inner_req',
        'go2_webrtc_driver.msgs.future_resolver',
        'go2_webrtc_driver.msgs.validation',
        # ── uvicorn internals (not auto-discovered) ────────────────────────────
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.asyncio',
        'uvicorn.loops.none',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # ── other runtime deps ─────────────────────────────────────────────────
        'pycryptodome',
        'Crypto',
        'lz4',
        'lz4.frame',
        'sounddevice',
        'pyaudio',
        'wasmtime',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=f'unitree-go2-{VERSION}',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,       # show the server log in a terminal window
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name=f'unitree-go2-{VERSION}',
)

app = BUNDLE(
    coll,
    name=f'unitree-go2-{VERSION}.app',
    icon=None,
    bundle_identifier=f'com.unitree.go2.webapp.{VERSION}',
)
