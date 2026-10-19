"""Restricted Strix backend. Source is uploaded to disposable scratch, never host-mounted."""
import os
from agents.sandbox.sandboxes.docker import DockerSandboxClientOptions
from strix.runtime.docker_client import StrixDockerSandboxClient
from strix.runtime.docker_connection import connect_docker
from docker.types import LogConfig
from agents.sandbox.types import ExposedPortEndpoint
from relay import Relay
from source_archive import source_archive


def register():
    from strix.runtime.backends import register_backend

    class Client(StrixDockerSandboxClient):
        relay = None
        container_id = None

        async def delete(self, session):
            if self.relay:
                self.relay.close()
                self.relay = None
            return await super().delete(session)

        async def _create_container(self, image, *, manifest=None, exposed_ports=(), session_id=None):
            expected = os.environ['PREFLYT_STRIX_SANDBOX_IMAGE']
            if image != expected or not expected.startswith('sha256:'):
                raise RuntimeError('Pinned sandbox image required')
            network = os.environ['PREFLYT_STRIX_NETWORK']
            net = self.docker_client.networks.get(network)
            if not net.attrs.get('Internal'):
                raise RuntimeError('Sandbox network must deny external routing')
            container = self.docker_client.containers.create(
                image=image, detach=True, command=['tail', '-f', '/dev/null'],
                environment=await manifest.environment.resolve() if manifest else {},
                user='1000:1000', read_only=True, cap_drop=['ALL'],
                security_opt=['no-new-privileges:true'], network=network,
                mem_limit='4g', memswap_limit='4g', nano_cpus=2_000_000_000, pids_limit=256,
                tmpfs={'/tmp':'rw,exec,nosuid,nodev,size=268435456,mode=1777',
                       '/workspace':'rw,exec,nosuid,nodev,size=268435456,uid=1000,gid=1000,mode=0700',
                       '/home/pentester':'rw,nosuid,nodev,size=134217728,uid=1000,gid=1000,mode=0700'},
                labels={'preflyt.strix':os.environ['PREFLYT_STRIX_ASSESSMENT']},
                log_config=LogConfig(type='none'),
            )
            container.reload()
            config = container.attrs
            host = config['HostConfig']
            valid = (config['Config']['User'] == '1000:1000' and host['ReadonlyRootfs']
                     and not host['Privileged'] and not host.get('Binds') and not host.get('Mounts')
                     and 'ALL' in host['CapDrop'] and not host.get('CapAdd')
                     and host['Memory'] == 4 * 1024**3 and host['PidsLimit'] == 256
                     and host['NanoCpus'] == 2_000_000_000 and host['NetworkMode'] == network
                     and not host.get('ExtraHosts'))
            if not valid:
                container.remove(force=True)
                raise RuntimeError('Effective sandbox controls do not match admission')
            self.container_id = container.id
            return container

    async def backend(*, image, manifest, exposed_ports, bind_mounts=None):
        if bind_mounts:
            raise RuntimeError('Host mounts are forbidden')
        archive=source_archive(manifest)
        client=Client(connect_docker())
        session=await client.create(options=DockerSandboxClientOptions(image=image, exposed_ports=exposed_ports), manifest=manifest.model_copy(update={'entries':{}}))
        try:
            await session.start()
            from strix.runtime.session_manager import stage_extra_files
            await stage_extra_files(session, archive)
            status = await session.exec('cat', '/proc/self/status', timeout=5)
            fields = dict(line.split(':', 1) for line in status.stdout.decode().splitlines() if ':' in line)
            if not status.ok() or fields.get('CapEff', '').strip() != '0000000000000000' or fields.get('NoNewPrivs', '').strip() != '1' or fields.get('Seccomp', '').strip() != '2':
                raise RuntimeError('Effective sandbox process restrictions are unavailable')
            client.relay = Relay(client.container_id)
            async def resolve_port(port):
                if port != 48080:
                    raise RuntimeError('Only the in-sandbox proxy can be exposed')
                return ExposedPortEndpoint(host='127.0.0.1', port=client.relay.port, tls=False)
            session.resolve_exposed_port = resolve_port
            return client,session
        except BaseException:
            await client.delete(session)
            raise

    register_backend('preflyt',backend,supports_bind_mounts=False)
