#!/usr/bin/env python3
"""Installer configuration: stdin NUL fields, JSON storage, no shell evaluation."""
import json
import os
import re
import sys
sys.stdout.reconfigure(encoding="utf-8")
from urllib.parse import quote

KEYS = ('SITE_NAME', 'INSTALL_DOMAIN', 'INSTALL_DM_USERNAME', 'INSTALL_DM_NAME',
        'INSTALL_DB_NAME', 'INSTALL_DB_USER', 'INSTALL_DB_PASSWORD', 'SESSION_SECRET')

def validate(values):
    site, domain, username, name, db, user, password, secret = values
    if any(not v or any(c in v for c in '\r\n\0') for v in values):
        raise ValueError('Settings must be nonempty single-line values.')
    if len(site) > 100 or len(name) > 100:
        raise ValueError('Website and display names must not exceed 100 characters.')
    if len(domain) > 253 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', domain):
        raise ValueError('Enter a public DNS hostname, without a scheme, port, path, or wildcard.')
    if not re.fullmatch(r'[a-z0-9_.-]{3,32}', username):
        raise ValueError('DM username must use 3-32 lowercase letters, numbers, dots, underscores or hyphens.')
    for identifier in (db, user):
        if not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', identifier) or identifier.startswith('pg_') or identifier in ('postgres', 'template0', 'template1'):
            raise ValueError('Database names/users must be lowercase SQL identifiers; reserved names are not allowed.')
    if len(secret) < 32:
        raise ValueError('Session secret must contain at least 32 characters.')
    if len(password) < 16:
        raise ValueError('Database passwords must contain at least 16 characters.')

def create(values):
    validate(values)
    config = dict(zip(KEYS, values))
    config.update(NODE_ENV='production', HOSTNAME='127.0.0.1', PORT='3000',
                  APP_URL='https://' + config['INSTALL_DOMAIN'],
                  DATABASE_URL='postgresql://{}:{}@127.0.0.1:5432/{}'.format(
                      quote(config['INSTALL_DB_USER'], safe=''), quote(config['INSTALL_DB_PASSWORD'], safe=''),
                      quote(config['INSTALL_DB_NAME'], safe='')))
    return config

def main():
    mode = sys.argv[1]
    if mode == 'create':
        values = sys.stdin.buffer.read().decode().split('\0')
        if values[-1] == '': values.pop()
        if len(values) != len(KEYS): raise ValueError('Incomplete configuration.')
        config = create(values)
        destination = sys.argv[2]
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as target: json.dump(config, target, ensure_ascii=False, indent=2)
    else:
        with open(sys.argv[2]) as source: config = json.load(source)
        validate([config[key] for key in KEYS])
        if mode == 'read':
            sys.stdout.buffer.write(('\0'.join(config[key] for key in KEYS) + '\0').encode())
        elif mode == 'sql':
            # Identifiers are validated; literals are quoted independently of shell parsing.
            password = config['INSTALL_DB_PASSWORD'].replace("'", "''")
            print('SET standard_conforming_strings = on;')
            print('CREATE ROLE "{}" LOGIN PASSWORD \'{}\';'.format(config['INSTALL_DB_USER'], password))
        else: raise ValueError('Unknown operation.')

if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        # Never print inputs, connection strings, or SQL on failure.
        print('Configuration failed: ' + (str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else 'invalid or inaccessible configuration file.'), file=sys.stderr)
        sys.exit(1)
