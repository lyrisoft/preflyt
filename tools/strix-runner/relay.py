"""Loopback-only ingress to Caido over Docker exec; no sandbox outbound route."""
import os
import select
import socketserver
import subprocess
import threading
import time


# This fixed transport runs inside the owned container, with its configured user.
# Repository content is transported as bytes, never used as host command text.
TRANSPORT = """
import os,socket,threading
s=socket.create_connection(('127.0.0.1',48080),timeout=10)
s.settimeout(None)
def upload():
    try:
        while chunk:=os.read(0,65536):s.sendall(chunk)
    finally:
        try:s.shutdown(socket.SHUT_WR)
        except OSError:pass
threading.Thread(target=upload,daemon=True).start()
while chunk:=s.recv(65536):
    view=memoryview(chunk)
    while view:view=view[os.write(1,view):]
"""


class Relay:
    def __init__(self, container_id):
        owner = self
        self.closed = threading.Event()
        self.slots = threading.BoundedSemaphore(8)
        self.processes = set()
        self.lock = threading.Lock()

        class Handler(socketserver.BaseRequestHandler):
            def handle(self):
                if not owner.slots.acquire(blocking=False):
                    return
                process = None
                try:
                    process = subprocess.Popen(
                        ["docker", "exec", "-i", container_id, "python3", "-c", TRANSPORT],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    )
                    with owner.lock:
                        owner.processes.add(process)
                    self.request.settimeout(5)
                    deadline = time.monotonic() + 120
                    transferred = 0
                    while not owner.closed.is_set() and time.monotonic() < deadline:
                        ready, _, _ = select.select([self.request, process.stdout], [], [], 1)
                        for stream in ready:
                            data = os.read(stream.fileno(), 65536)
                            if not data:
                                return
                            transferred += len(data)
                            if transferred > 32 * 1024 * 1024:
                                return
                            if stream is self.request:
                                process.stdin.write(data)
                                process.stdin.flush()
                            else:
                                self.request.sendall(data)
                except (OSError, ValueError):
                    pass
                finally:
                    if process:
                        process.kill()
                        process.wait()
                        process.stdin.close()
                        process.stdout.close()
                        with owner.lock:
                            owner.processes.discard(process)
                    owner.slots.release()

        class Server(socketserver.ThreadingTCPServer):
            daemon_threads = True

        self.server = Server(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.closed.set()
        self.server.shutdown()
        self.server.server_close()
        with self.lock:
            for process in self.processes:
                process.kill()
