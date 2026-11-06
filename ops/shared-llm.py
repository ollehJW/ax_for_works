#!/usr/bin/env python3
"""Launch a service with centrally managed LLM credentials (never logs values)."""
import argparse
import os
from pathlib import Path
from dotenv import dotenv_values

KEYS = ('OPENAI_MODEL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_VERSION')
SERVICES = ('wiameet', 'wiareport', 'wianews', 'wiacoding')


def load_settings(path, service):
    if service not in SERVICES:
        raise ValueError('Unsupported LLM service')
    path = Path(path)
    if not path.is_file():
        raise RuntimeError('Shared LLM configuration file is missing')
    values = dotenv_values(path, interpolate=False)
    # Optional centrally stored overrides preserve deployments that use separate keys/models.
    settings = {
        key: values.get(service.upper() + '_' + key, values.get(key))
        for key in KEYS
    }
    missing = [key for key, value in settings.items() if not value or not value.strip()]
    if missing:
        raise RuntimeError('Missing shared LLM settings: ' + ', '.join(missing))
    return settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/data/shared/llm.env')
    parser.add_argument('service', choices=SERVICES)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command
    if command and command[0] == '--':
        command = command[1:]
    if not command:
        parser.error('A service command is required')
    env = dict(os.environ)
    env.update(load_settings(args.config, args.service))
    os.execvpe(command[0], command, env)


if __name__ == '__main__':
    main()
