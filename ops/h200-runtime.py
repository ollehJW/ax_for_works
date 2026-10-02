#!/usr/bin/env python3
"""Launch only the three AX services; never manages WiaMeet/WiaReport."""
import argparse
import os
from pathlib import Path
import shutil
import sys
from dotenv import dotenv_values

SERVICES = {'ax_for_works': 'axforworks', 'wianews': 'wianews', 'wiacoding': 'wiacoding'}
HOME = Path.home()
DATA = Path('/data')

def launch(service, component):
    project = HOME / service
    values = dotenv_values(DATA / SERVICES[service] / 'runtime.env')
    if not values or not values.get('AX_DB_PASSWORD'):
        raise RuntimeError('Missing private runtime configuration')
    env = {**os.environ, **{k: v for k, v in values.items() if v is not None}}
    env['PYTHONUNBUFFERED'] = '1'
    port = int(env['BACKEND_PORT' if component == 'backend' else 'FRONTEND_PORT'])
    if not 1 <= port <= 65535:
        raise ValueError('Invalid port')
    os.chdir(project)
    if component == 'backend':
        args = [str(project / '.venv/bin/python'), '-m', 'uvicorn', 'backend.main:app',
                '--host', '127.0.0.1', '--port', str(port), '--no-proxy-headers']
    else:
        node = env.get('NODE_EXECUTABLE') or shutil.which('node')
        if not node:
            raise RuntimeError('Node.js is not on PATH; set NODE_EXECUTABLE')
        script = 'ops/frontend-proxy.mjs' if service == 'ax_for_works' else 'frontend/server.mjs'
        args = [node, script]
    os.execve(args[0], args, env)


def configure():
    root = DATA / 'axforworks'
    for path in [root / 'run', root / 'logs']:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    text = f'''[unix_http_server]
file={root}/run/supervisor.sock
chmod=0700
[supervisord]
pidfile={root}/run/supervisord.pid
logfile={root}/logs/supervisord.log
logfile_maxbytes=10MB
logfile_backups=3
childlogdir={root}/logs
[rpcinterface:supervisor]
supervisor.rpcinterface_factory=supervisor.rpcinterface:make_main_rpcinterface
[supervisorctl]
serverurl=unix://{root}/run/supervisor.sock
'''
    for service, folder in SERVICES.items():
        logs = DATA / folder / 'logs'
        logs.mkdir(parents=True, exist_ok=True, mode=0o700)
        for component in ['backend', 'frontend']:
            name = f'{service}-{component}'
            text += f'''\n[program:{name}]
command={HOME}/ax_for_works/.venv/bin/python {HOME}/ax_for_works/ops/h200-runtime.py run {service} {component}
directory={HOME}/{service}
autostart=true
autorestart=unexpected
startsecs=5
startretries=3
stopsignal=TERM
stopasgroup=true
killasgroup=true
stopwaitsecs=40
redirect_stderr=true
stdout_logfile={logs}/{component}.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
'''
    config = root / 'supervisord.conf'
    config.write_text(text)
    config.chmod(0o600)
    print(f'Configured {config}; services are not started by this command.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('configure')
    run = sub.add_parser('run')
    run.add_argument('service', choices=SERVICES)
    run.add_argument('component', choices=['frontend', 'backend'])
    args = parser.parse_args()
    configure() if args.command == 'configure' else launch(args.service, args.component)
