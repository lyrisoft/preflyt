"""One-shot storage ownership and engine client-certificate copy; never exposes server keys."""
import os
from pathlib import Path
import secrets


def initialize(directories, engine_certificates, client_certificates, uid=1000, gid=1000):
    for directory in [*directories, client_certificates]:
        path=Path(directory)
        path.mkdir(parents=True,exist_ok=True,mode=0o700)
        if path.is_symlink() or not path.is_dir():raise ValueError('Unsafe Strix storage')
        os.chown(path,uid,gid);path.chmod(0o700)
    for name in ['ca.pem','cert.pem','key.pem']:
        source=Path(engine_certificates)/name
        fd=os.open(source,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as stream:
            if not __import__('stat').S_ISREG(os.fstat(stream.fileno()).st_mode):raise ValueError('Invalid engine certificate')
            content=stream.read(16385)
        if len(content)>16384 or not content.startswith(b'-----BEGIN '):raise ValueError('Invalid engine certificate')
        target=Path(client_certificates)/name
        temporary=target.with_suffix('.'+secrets.token_hex(8)+'.tmp')
        try:
            fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o400)
            with os.fdopen(fd,'wb') as stream:stream.write(content)
            os.chown(temporary,uid,gid);temporary.replace(target)
        finally:temporary.unlink(missing_ok=True)

if __name__=='__main__':
    initialize(['/var/lib/preflyt/strix','/run/preflyt-strix'],'/engine-certs/client','/run/docker-tls')
    print('Strix storage and engine client connection are ready.')
