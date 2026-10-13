#!/usr/bin/env python3
"""Read-only 15-second host smoke test. Build with --skip-web first."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--restart', action='store_true', help='Terminate only this test backend once to verify recovery')
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
work = root / 'apps/macos/.build/dev-resources'
frontend = work / 'frontend'
frontend.mkdir(parents=True, exist_ok=True)
for page in ['main', 'ai-chat', 'notes', 'settings', 'welcome', 'theme-studio']:
    shutil.copyfile(root / 'apps/macos/DevStub/main.html', frontend / f'{page}.html')
subprocess.run(['pnpm', '--filter', '@opencast/backend', 'exec', 'esbuild',
                str(root / 'packages/frontend/src/lib/migrate-storage.ts'), '--format=esm',
                '--outfile=' + str(frontend / 'storage-migration.js')], cwd=root, check=True)
log_dir = work / 'logs'
log = log_dir / 'backend.log'
start = log.stat().st_size if log.exists() else 0
env = dict(os.environ, OPENCAST_BACKEND_ENTRY=str(root / 'apps/macos/DevStub/stub-backend.mjs'),
           OPENCAST_RESOURCES=str(work), OPENCAST_DATA_DIR=str(work / 'data'), OPENCAST_LOG_DIR=str(log_dir),
           OPENCAST_SHOW_ON_START='1', OPENCAST_KEEP_OPEN='1', OPENCAST_EPHEMERAL_WEB_STORAGE='1')
executable = root / 'build/OpenCast.app/Contents/MacOS/OpenCast'
native_log = log_dir / 'native.log'
native_start = native_log.stat().st_size if native_log.exists() else 0
children = set()

def child_pids(parent):
    output = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,command='], text=True)
    return [int(parts[0]) for line in output.splitlines() if len(parts := line.strip().split(None, 2)) == 3
            and parts[1] == str(parent) and 'stub-backend.mjs' in parts[2]]

with (root / 'apps/macos/.build/smoke-native.log').open('w') as output:
    process = subprocess.Popen([str(executable)], env=env, stdout=output, stderr=output)
    restarted = False
    duplicate_checked = False
    try:
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise AssertionError(f'Host exited early ({process.returncode}); inspect .build/smoke-native.log')
            current = child_pids(process.pid)
            children.update(current)
            text = log.read_bytes()[start:].decode() if log.exists() else ''
            if 'WEB_BRIDGE' in text and not duplicate_checked:
                duplicate = subprocess.run([str(executable)], env=env, stdout=output, stderr=output, timeout=4)
                assert duplicate.returncode == 0, 'Second instance did not exit cleanly'
                duplicate_checked = True
            if args.restart and 'WEB_BRIDGE' in text and not restarted and current:
                os.kill(current[0], signal.SIGTERM)
                restarted = True
            time.sleep(0.25)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("Host did not terminate within 5s; forcing cleanup", flush=True)
                process.kill()
                process.wait()
        for pid in children:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                continue
            os.kill(pid, signal.SIGKILL)
            raise AssertionError(f'Test backend {pid} survived host shutdown; forcibly cleaned up')

text = log.read_bytes()[start:].decode()
results = {}
reports = []
for line in text.splitlines():
    if ' RESULT ' in line:
        method, payload = line.split(' RESULT ', 1)[1].split(' ', 1)
        results[method] = json.loads(payload)
    if ' WEB_BRIDGE ' in line:
        reports.append(json.loads(line.split(' WEB_BRIDGE ', 1)[1]))
assert results.get('app.info', {}).get('version') == '0.1.0', 'app.info result missing'
assert len(results.get('apps.list', [])) > 0, 'Application catalog is empty'
assert len(results.get('windows.screens', [])) > 0, 'Screen list is empty'
assert results.get('not.a.method', {}).get('code') == -32601, 'Unknown method error is incorrect'
assert results.get('hotkeys.register', {}).get('ok'), 'Identical launcher hotkey re-registration failed'
assert results.get('app.setMenuBarIconVisible', {}).get('code') == -32602, 'Required params did not produce InvalidParams'
assert 'NATIVE_REQUEST backend.ping' in text, 'Native-to-backend request was not observed'
assert reports, 'Web-view bridge did not report; inspect .build/smoke-native.log'
for report in reports:
    assert report['heightOK'] and report['iconOK'] and report['macos'] and report['unknownCode'] == -32601
    assert report['window'] == 'main' and report['screens'] > 0
    assert report['appScheme'] == 'surgecast-app:' and report['storageMigrated'], 'Upgrade storage was not accessible'
assert duplicate_checked, 'Single-instance guard was not tested'
activation_log = native_log.read_bytes()[native_start:].decode()
for name in ['app.opencast.showLauncher', 'app.surgecast.showLauncher']:
    assert f'Launcher activation requested ({name})' in activation_log, f'Activation missing for {name}'
if args.restart:
    assert restarted and len(reports) >= 2 and text.count('STARTUP_CHECKS_COMPLETE') >= 2, 'Backend restart did not reload the frontend'
    assert reports[-1]['storageRetained'], 'Window preferences were lost on backend reload'
assert process.returncode == 0, f'Host did not terminate cleanly ({process.returncode})'
summary = {'applications': len(results['apps.list']), 'screens': len(results['windows.screens']),
           'webBridgeReports': len(reports), 'singleInstance': duplicate_checked,
           'backendRestart': args.restart, 'hostExit': process.returncode, 'childCleanup': True,
           'legacyActivation': True, 'storageMigration': True}
print('PASS:', json.dumps(summary, sort_keys=True))
