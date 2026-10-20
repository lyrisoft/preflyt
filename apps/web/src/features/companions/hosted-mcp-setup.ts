export type McpClient = 'codex' | 'claude' | 'deepseek'

export function hostedMcpSetup(client: McpClient, endpoint: string) {
  if (client === 'deepseek') {
    const url = new URL(endpoint)
    url.pathname = url.pathname.replace(
      /\/mcp$/,
      '/mcp-setup/deepseek/preflyt-connector-1.0.0.tgz'
    )
    return [
      {
        title: 'Preflyt connector',
        code: url.href,
        copyLabel: 'Copy install link',
      },
    ]
  }
  return [
    {
      title: 'One-time connection',
      code:
        client === 'codex'
          ? `codex mcp add preflyt --url ${endpoint}\ncodex mcp login preflyt`
          : `claude mcp add --transport http --scope user preflyt ${endpoint}`,
      copyLabel: 'Copy command',
    },
  ]
}
