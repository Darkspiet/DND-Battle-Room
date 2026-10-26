"""Installer lifecycle tests; all shell mutations are confined to temporary fixtures."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = (Path(__file__).resolve().parents[2] / 'install.sh').read_text(encoding='utf-8')
HELPERS = SOURCE.split('# BEGIN LIFECYCLE HELPERS\n', 1)[1].split('# END LIFECYCLE HELPERS', 1)[0]
CADDY_EDITOR = re.search(r"<<'PY_CADDY'\n(.*?)\nPY_CADDY\n", SOURCE, re.S).group(1)


class CaddyEditingTests(unittest.TestCase):
    def edit(self, source, destination, site, action):
        return subprocess.run([sys.executable, '-c', CADDY_EDITOR, str(source), str(destination), str(site), action], capture_output=True, text=True)

    def test_add_retry_and_remove_preserve_other_websites(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config, output, site = root / 'Caddyfile', root / 'next', root / 'room.caddy'
            original = 'other.example.com {\n    reverse_proxy localhost:9000\n}\n'
            config.write_text(original)
            self.assertEqual(self.edit(config, output, site, 'add').returncode, 0)
            added = output.read_text()
            self.assertIn(original, added)
            config.write_text(added)
            self.assertEqual(self.edit(config, output, site, 'add').returncode, 0)
            self.assertEqual(output.read_text(), added)
            self.assertEqual(self.edit(config, output, site, 'remove').returncode, 0)
            self.assertEqual(output.read_text(), original)

    def test_edited_and_duplicate_blocks_fail_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for text in ['# BEGIN DND BATTLE ROOM\n', '# BEGIN DND BATTLE ROOM\nimport unrelated\n# END DND BATTLE ROOM\n', '# BEGIN DND BATTLE ROOM\n# END DND BATTLE ROOM\n' * 2]:
                with self.subTest(text=text):
                    config, output = root / 'Caddyfile', root / 'next'
                    config.write_text(text)
                    self.assertNotEqual(self.edit(config, output, root / 'room', 'remove').returncode, 0)
                    self.assertEqual(config.read_text(), text)
                    self.assertFalse(output.exists())


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash'), 'Bash lifecycle scenarios run on Linux/CI')
class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.app = self.root / 'opt/dnd-battle-room'
        self.node = self.root / 'opt/dnd-battle-room-node'
        self.config = self.root / 'etc/dnd-battle-room'
        self.unit = self.root / 'etc/systemd/system/dnd-battle-room.service'
        self.caddy = self.root / 'etc/caddy/Caddyfile'
        self.site = self.root / 'etc/caddy/dnd-battle-room.caddy'
        self.media = self.root / 'var/lib/dnd-battle-room/assets'
        self.database = self.root / 'postgres-existing-data'
        self.shared_node = self.root / 'system-node'
        for path in [self.app, self.node / 'bin', self.config, self.unit.parent, self.caddy.parent, self.media]:
            path.mkdir(parents=True, exist_ok=True)
        self.config.chmod(0o750)
        self.saved_config = {'DATABASE_URL': 'postgresql://fixture:literal%40password@localhost/dnd_fixture', 'ASSET_DIR': str(self.media)}
        (self.config / 'config.json').write_text(json.dumps(self.saved_config))
        (self.config / 'config.json').chmod(0o640)
        (self.config / 'installer-version').write_text('v1.0.0')
        (self.config / 'installer-version').chmod(0o600)
        (self.config / 'bootstrap.done').touch()
        (self.config / 'database_started.done').touch()
        self.database.write_text('unrelated and application records')
        (self.media / 'portrait.png').write_bytes(b'preserved uploaded media')
        (self.app / 'server.mjs').write_text('application code')
        self.shared_node.write_text('shared runtime stays installed')
        (self.node / 'bin/node').symlink_to(self.shared_node)
        self.unit.write_text('[Service]\nUser=dnd-battle-room\n')
        self.site.write_text('battle.example.com {\n reverse_proxy 127.0.0.1:3000\n}\n')
        self.other_site = 'other.example.com {\n reverse_proxy 127.0.0.1:9000\n}\n'
        self.caddy.write_text(self.other_site + f'# BEGIN DND BATTLE ROOM\nimport {self.site}\n# END DND BATTLE ROOM\n')
        for label, target in [('service', self.unit), ('caddy-site', self.site)]:
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            (self.config / f'{label}.sha256').write_text(f'{digest}  {target}\n')
        for path in self.config.iterdir(): path.chmod(0o600)

    def run_shell(self, command, confirm='UNINSTALL', caddy_error='0', reload_error='0'):
        # Rewrite fixed Linux paths in this TEST COPY only. Production has no
        # environment override for its removal paths. No sudo/system service runs.
        helpers = HELPERS
        for prefix in ['/etc/', '/opt/', '/var/lib/']:
            helpers = helpers.replace(prefix, str(self.root) + prefix)
        values = {'TEST_ROOT': str(self.root), 'APP_DIR': str(self.app), 'NODE_DIR': str(self.node), 'CONFIG_DIR': str(self.config), 'CONFIG_FILE': str(self.config / 'config.json'), 'CADDY_CONFIG': str(self.caddy), 'CADDY_SITE': str(self.site), 'SERVICE': 'dnd-battle-room', 'WORK': '', 'CONFIRM': confirm, 'CADDY_ERROR': caddy_error, 'RELOAD_ERROR': reload_error}
        prelude = '''set -euo pipefail
umask 077
fail() { printf '%s\\n' "$*" >&2; exit 1; }
done_stage() { [[ -f "$CONFIG_DIR/$1.done" ]]; }
mark() { touch "$CONFIG_DIR/$1.done"; }
# Metadata belongs to this unprivileged fixture user; simulate only root UID.
stat() { if [[ "$1" == -c && "$2" == %u ]]; then printf '0\\n'; else command stat "$@"; fi; }
systemctl() { printf '%s\\n' "$*" >> "$TEST_ROOT/service-actions"; [[ "$1" != reload || "$RELOAD_ERROR" != 1 ]]; }
caddy() { printf '%s\\n' "$*" >> "$TEST_ROOT/caddy-actions"; [[ "$CADDY_ERROR" != 1 ]]; }
mktemp() { mkdir -p "$TEST_ROOT/work"; printf '%s\\n' "$TEST_ROOT/work"; }
'''
        assignment = '\n'.join(f'{key}={shlex.quote(value)}' for key, value in values.items())
        return subprocess.run(['bash', '-c', prelude + assignment + '\n' + helpers + '\nexec 3<<<"$CONFIRM"\n' + command], capture_output=True, text=True)

    def assert_data_preserved(self):
        self.assertEqual(self.database.read_text(), 'unrelated and application records')
        self.assertEqual((self.media / 'portrait.png').read_bytes(), b'preserved uploaded media')
        self.assertEqual(json.loads((self.config / 'config.json').read_text()), self.saved_config)
        self.assertEqual(self.shared_node.read_text(), 'shared runtime stays installed')
        self.assertTrue((self.config / 'bootstrap.done').exists())
        self.assertTrue((self.config / 'database_started.done').exists())

    def test_uninstall_removes_only_app_resources_and_is_retryable(self):
        result = self.run_shell('uninstall_app')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.app.exists())
        self.assertFalse(self.node.exists())
        self.assertFalse(self.unit.exists())
        self.assertFalse(self.site.exists())
        self.assertEqual(self.caddy.read_text(), self.other_site)
        self.assertTrue((self.config / 'uninstalled.done').exists())
        self.assert_data_preserved()
        repeated = self.run_shell('uninstall_app')
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assert_data_preserved()

    def test_cancelled_uninstall_changes_nothing(self):
        before = self.caddy.read_bytes()
        result = self.run_shell('uninstall_app', confirm='no')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.app.exists())
        self.assertTrue(self.unit.exists())
        self.assertEqual(self.caddy.read_bytes(), before)
        self.assert_data_preserved()

    def test_caddy_file_permissions_are_preserved(self):
        self.caddy.chmod(0o640)
        result = self.run_shell('uninstall_app')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.caddy.stat().st_mode & 0o777, 0o640)
        self.assert_data_preserved()

    def test_modified_units_and_sites_refuse_removal(self):
        for path in [self.unit, self.site]:
            original = path.read_bytes()
            path.write_text('edited by the operator')
            result = self.run_shell('uninstall_app')
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(self.app.exists())
            self.assertTrue(self.node.exists())
            self.assert_data_preserved()
            path.write_bytes(original)

    def test_caddy_validation_and_reload_failure_preserve_configuration(self):
        original = self.caddy.read_bytes()
        for caddy, reload in [('1', '0'), ('0', '1')]:
            result = self.run_shell('uninstall_app', caddy_error=caddy, reload_error=reload)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(self.caddy.read_bytes(), original)
            self.assertTrue(self.site.exists())
            self.assertTrue(self.app.exists())
            self.assert_data_preserved()

    def test_external_proxy_is_not_touched(self):
        (self.config / 'caddy-site.sha256').unlink()
        original = self.caddy.read_bytes()
        result = self.run_shell('uninstall_app')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.caddy.read_bytes(), original)
        self.assertTrue(self.site.exists())
        self.assertFalse((self.root / 'caddy-actions').exists())
        self.assert_data_preserved()

    def test_uploads_inside_app_are_not_deleted(self):
        self.saved_config['ASSET_DIR'] = str(self.app / '.data/assets')
        (self.config / 'config.json').write_text(json.dumps(self.saved_config))
        result = self.run_shell('uninstall_app')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Uploads are inside', result.stderr)
        self.assertTrue(self.app.exists())
        self.assert_data_preserved()

    def test_symlinks_and_writable_metadata_are_rejected(self):
        original = self.app.with_name('unrelated')
        self.app.rename(original)
        self.app.symlink_to(original, target_is_directory=True)
        result = self.run_shell('uninstall_app')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((original / 'server.mjs').exists())
        self.app.unlink()
        original.rename(self.app)
        self.config.chmod(0o770)
        self.assertNotEqual(self.run_shell('uninstall_app').returncode, 0)
        self.assertTrue(self.app.exists())

    def test_mounted_data_is_not_removed(self):
        result = self.run_shell('findmnt() { printf "%s\\n" "$APP_DIR/mounted-data"; }; uninstall_app')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Mounted data exists', result.stderr)
        self.assertTrue((self.app / 'server.mjs').exists())
        self.assert_data_preserved()

    def test_failed_mount_inspection_stops_uninstall(self):
        result = self.run_shell('findmnt() { return 1; }; uninstall_app')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Cannot inspect mounted data', result.stderr)
        self.assertTrue(self.app.exists())
        self.assert_data_preserved()

    def test_installed_packages_and_existing_pg_cluster_are_reused(self):
        script = '''dpkg-query() { printf 'install ok installed'; }
pg_lsclusters() { printf '16 main 5432 online postgres /fixture /fixture\\n'; }
dependency_packages'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '')
        script = '''dpkg-query() { [[ "$*" == *xz-utils* ]] && return 1; printf 'install ok installed'; }
pg_lsclusters() { :; }
dependency_packages'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ['xz-utils', 'postgresql', 'postgresql-contrib'])

    def test_compatible_node_links_are_retryable_and_do_not_modify_system_tools(self):
        tools = self.root / 'global-tools'
        tools.mkdir()
        for name, content in [('node', '#!/bin/sh\nprintf 24'), ('npm', '#!/bin/sh\nexit 0')]:
            (tools / name).write_text(content)
            (tools / name).chmod(0o755)
        # Trust validation is separate from link/cleanup behavior; substitute it
        # here to avoid requiring fixture binaries under the real /usr tree.
        script = f'''PATH={shlex.quote(str(tools))}:$PATH
trusted_system_tool() {{ return 0; }}
reuse_node_runtime
reuse_node_runtime'''
        before = (tools / 'node').read_bytes()
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.node / 'bin/node').resolve(), tools / 'node')
        self.assertEqual((tools / 'node').read_bytes(), before)
        (tools / 'node').write_text('#!/bin/sh\nprintf 22')
        self.assertNotEqual(self.run_shell(script).returncode, 0)

    def test_user_managed_runtime_is_not_trusted(self):
        result = self.run_shell(f'trusted_system_tool {shlex.quote(str(self.shared_node))}')
        self.assertNotEqual(result.returncode, 0)

    def test_help_and_conflicting_actions_do_not_start_installation(self):
        installer = Path(__file__).resolve().parents[2] / 'install.sh'
        help_result = subprocess.run(['bash', str(installer), '--help'], capture_output=True, text=True)
        self.assertEqual(help_result.returncode, 0)
        self.assertIn('--uninstall', help_result.stdout)
        for arguments in [('--install', '--uninstall'), ('--uninstall', '--local-archive', '/not-used.zip')]:
            result = subprocess.run(['bash', str(installer), *arguments], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('Install / resume', result.stdout)


if __name__ == '__main__': unittest.main()
