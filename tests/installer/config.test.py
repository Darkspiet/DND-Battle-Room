import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import unquote, urlparse

HELPER = Path(__file__).resolve().parents[2] / 'scripts' / 'installer-config.py'
spec = importlib.util.spec_from_file_location('installer_config', HELPER)
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)

class ConfigurationTests(unittest.TestCase):
    def settings(self):
        return ['The "Dragon" $HOME `room`', 'battles.example.com', 'gamemaster', 'First DM',
                'dnd_room', 'dnd_user', 'a long \'"\\ $`#@:/% ü password']

    def test_roundtrip_and_sql_escaping(self):
        values = self.settings()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            created = subprocess.run([sys.executable, str(HELPER), 'create', str(path)],
                                     input=('\0'.join(values)+'\0').encode(), capture_output=True)
            self.assertEqual(created.returncode, 0, created.stderr)
            stored = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(unquote(urlparse(stored['DATABASE_URL']).password), values[6])
            read = subprocess.run([sys.executable, str(HELPER), 'read', str(path)], capture_output=True)
            self.assertEqual(read.stdout.decode().split('\0')[:-1], values)
            sql = subprocess.run([sys.executable, str(HELPER), 'sql', str(path)], capture_output=True)
            self.assertEqual(sql.returncode, 0)
            self.assertIn(values[6].replace("'", "''"), sql.stdout.decode())
            retry = subprocess.run([sys.executable, str(HELPER), 'create', str(path)],
                                   input=('\0'.join(values)+'\0').encode(), capture_output=True)
            self.assertNotEqual(retry.returncode, 0)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), stored)
            self.assertNotIn(values[6].encode(), retry.stderr)

    def test_rejects_injection_and_invalid_input(self):
        for index, invalid in [(1, 'https://example.com'), (1, 'example.com;reboot'),
                               (1, '*.example.com'), (2, 'bad user'), (4, 'x; drop database postgres'),
                               (5, 'postgres'), (5, 'pg_reserved'), (0, 'bad\nname'), (6, 'short')]:
            values = self.settings()
            values[index] = invalid
            with self.subTest(index=index, invalid=invalid), self.assertRaises(ValueError):
                config.create(values)

    def test_proxy_mode_is_literal_and_defaults_to_caddy(self):
        self.assertEqual(config.create(self.settings())['INSTALL_PROXY_MODE'], 'caddy')
        self.assertEqual(config.create(self.settings(), 'external')['INSTALL_PROXY_MODE'], 'external')
        with self.assertRaises(ValueError):
            config.create(self.settings(), 'external; reboot')

    def test_reinstall_changes_only_proxy_mode_without_echoing_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            original = config.create(self.settings())
            path.write_text(json.dumps(original), encoding='utf-8')
            changed = subprocess.run([sys.executable, str(HELPER), 'set-proxy', str(path), 'external'], capture_output=True)
            self.assertEqual(changed.returncode, 0, changed.stderr)
            self.assertEqual(changed.stdout, b'')
            expected = {**original, 'INSTALL_PROXY_MODE': 'external'}
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), expected)
            rejected = subprocess.run([sys.executable, str(HELPER), 'set-proxy', str(path), 'bad; command'], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertNotIn(original['INSTALL_DB_PASSWORD'].encode(), rejected.stderr)
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), expected)

if __name__ == '__main__': unittest.main()
