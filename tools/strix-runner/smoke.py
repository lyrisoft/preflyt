"""Boot the restricted backend with a harmless fixture, without making model calls."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import tempfile
from uuid import uuid4

from sandbox import register
from strix.runtime.docker_connection import connect_docker
from strix.runtime.session_manager import create_or_reuse, cleanup


async def main():
    if not os.environ.get("DOCKER_HOST"):
        os.environ["DOCKER_HOST"] = subprocess.check_output(
            ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
            text=True,
        ).strip()
    client = connect_docker()
    job = str(uuid4())
    image = client.images.get("preflyt-strix-sandbox:local").id
    os.environ.update({
        "STRIX_RUNTIME_BACKEND": "preflyt",
        "PREFLYT_STRIX_SANDBOX_IMAGE": image,
        "PREFLYT_STRIX_NETWORK": "preflyt-strix-isolated",
        "PREFLYT_STRIX_ASSESSMENT": job,
        "STRIX_TELEMETRY": "false",
    })
    register()
    try:
        with tempfile.TemporaryDirectory(prefix="preflyt-strix-smoke-") as directory:
            (Path(directory) / "probe.txt").write_text("preflyt-sdk-upload")
            for index in range(1000):
                (Path(directory) / f"probe-{index}.txt").write_text("bulk-upload-fixture")
            original_cwd = Path.cwd()
            os.chdir(directory)
            bundle = await asyncio.wait_for(create_or_reuse(
                job, image=image,
                local_sources=[{"source_path": directory, "workspace_subdir": "source"}],
            ), timeout=60)
            await asyncio.wait_for(bundle["caido_client"].get(), timeout=45)
            result = await bundle["session"].exec("cat", "/workspace/source/probe.txt", timeout=5)
            assert result.ok() and result.stdout.decode().strip() == "preflyt-sdk-upload"
            containers = client.containers.list(filters={"label": "preflyt.strix=" + job})
            assert len(containers) == 1
            containers[0].reload()
            config = containers[0].attrs
            host = config["HostConfig"]
            assert config["Config"]["User"] == "1000:1000"
            assert host["ReadonlyRootfs"] and not host["Privileged"]
            assert "ALL" in host["CapDrop"] and not host.get("CapAdd")
            assert host["Memory"] == 4 * 1024**3 and host["PidsLimit"] == 256
            assert not host.get("Binds") and not host.get("Mounts")
            assert client.networks.get(host["NetworkMode"]).attrs["Internal"]
            print(json.dumps({"sourceUpload": "passed", "runtimeControls": "passed"}))
    finally:
        await cleanup(job)
        if "original_cwd" in locals():
            os.chdir(original_cwd)
        for container in client.containers.list(all=True, filters={"label": "preflyt.strix=" + job}):
            container.remove(force=True)
        assert not client.containers.list(all=True, filters={"label": "preflyt.strix=" + job})
        print("Cleanup confirmed")


if __name__ == "__main__":
    asyncio.run(main())
