import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile

SOURCE = (Path(__file__).resolve().parents[2] / 'install.sh').read_text(encoding='utf-8')
EXTRACTOR = SOURCE.split("<<'PY'", 1)[1].split("\nPY\n", 1)[0].split("\n", 1)[1]

class ArchiveTests(unittest.TestCase):
    def extract(self, filename, destination):
        return subprocess.run([sys.executable, '-c', EXTRACTOR, str(filename), str(destination)], capture_output=True, text=True)

    def test_zip_and_tar_extract_single_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'source.zip'
            with zipfile.ZipFile(archive, 'w') as source:
                source.writestr('release/install.sh', '#!/bin/bash\n')
                source.writestr('release/package.json', '{}')
            destination = root / 'zip'
            destination.mkdir()
            self.assertEqual(self.extract(archive, destination).returncode, 0)
            self.assertEqual((destination / 'package.json').read_text(), '{}')
            archive = root / 'source.tar.gz'
            with tarfile.open(archive, 'w:gz') as source:
                item = tarfile.TarInfo('release/package.json')
                item.size = 2
                source.addfile(item, io.BytesIO(b'{}'))
            destination = root / 'tar'
            destination.mkdir()
            self.assertEqual(self.extract(archive, destination).returncode, 0)
            self.assertTrue((destination / 'package.json').exists())

    def test_unsafe_paths_and_multiple_roots_are_rejected(self):
        for names in [('release/../../escape',), ('/absolute',), ('release/C:/escape',), ('release\\escape',), ('one/a', 'two/b')]:
            with self.subTest(names=names), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / 'bad.zip'
                with zipfile.ZipFile(archive, 'w') as source:
                    for name in names:
                        member = zipfile.ZipInfo('placeholder')
                        member.filename = name
                        source.writestr(member, 'bad')
                destination = root / 'out'
                destination.mkdir()
                self.assertNotEqual(self.extract(archive, destination).returncode, 0)
                self.assertEqual(list(destination.rglob('*')), [])

    def test_links_and_special_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'link.tar'
            with tarfile.open(archive, 'w') as source:
                member = tarfile.TarInfo('release/link')
                member.type = tarfile.SYMTYPE
                member.linkname = '/etc/passwd'
                source.addfile(member)
            destination = root / 'out'
            destination.mkdir()
            self.assertNotEqual(self.extract(archive, destination).returncode, 0)
            self.assertEqual(list(destination.iterdir()), [])

if __name__ == '__main__': unittest.main()
