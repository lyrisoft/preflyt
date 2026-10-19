// Local Docker Desktop bridge. TLS identity and authentication stay end to end.
import { createServer, connect } from 'node:net'

const server = createServer((client) => {
  const upstream = connect(3012, 'host.docker.internal')
  const close = () => {
    client.destroy()
    upstream.destroy()
  }
  client.on('error', close).on('close', () => {
    if (!client.readableEnded) upstream.destroy()
  })
  upstream.on('error', close).on('close', () => {
    if (!upstream.readableEnded) client.destroy()
  })
  client.setTimeout(60000, close)
  upstream.setTimeout(60000, close)
  client.pipe(upstream).pipe(client)
})
server.maxConnections = 8
server.listen(3012, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
