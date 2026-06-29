# omnifocus-mcp-bridge

Authenticated Streamable HTTP bridge for the published `omnifocus-mcp-enhanced`
stdio MCP server.

This repository is intentionally separate from the upstream server code. It
installs `omnifocus-mcp-enhanced` as a pinned npm dependency, launches that
package as a local child stdio MCP process, and exposes a private HTTP MCP
endpoint for remote clients on a host/port you control.

## Security Model

- `OMNIFOCUS_MCP_TOKEN_FILE` is preferred for the bearer secret. The file must be
  readable only by the owner, for example mode `0600`.
- When no token environment variables are set, the bridge looks for
  `.secrets/omnifocus-mcp-token` in the repository root.
- `OMNIFOCUS_MCP_TOKEN` is still supported for service managers that inject
  secrets directly, and it overrides `OMNIFOCUS_MCP_TOKEN_FILE`.
- The bridge refuses to start without `OMNIFOCUS_MCP_TOKEN`,
  `OMNIFOCUS_MCP_TOKEN_FILE`, or the default private token file.
- Every HTTP request must include `Authorization: Bearer <token>`.
- The default bind host is `127.0.0.1`.
- Bind `OMNIFOCUS_MCP_HOST` to a Tailscale/private interface when remote access is
  needed. Do not bind this service to a public interface.
- For HTTPS over a tailnet, prefer `pnpm start:tailscale`. It keeps the bridge
  on localhost and exposes it through Tailscale Serve at `/omnifocus-mcp`.
- The bridge is read-only by default. Mutating OmniFocus tools are hidden and
  rejected unless `OMNIFOCUS_MCP_READ_ONLY=false` is set explicitly.
- `.env` is loaded automatically when present. Values already present in the
  process environment override `.env` values.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OMNIFOCUS_MCP_TOKEN_FILE` | `.secrets/omnifocus-mcp-token` when present | Preferred path to a private file containing the bearer token. |
| `OMNIFOCUS_MCP_TOKEN` | none | Direct bearer token override. Avoid inline shell usage because it can leak through history. |
| `OMNIFOCUS_MCP_ENV_FILE` | `.env` when present | Optional dotenv file path. If explicitly set, the file must exist. |
| `OMNIFOCUS_MCP_HOST` | `127.0.0.1` | HTTP bind host. Use a private/Tailscale address for remote access. |
| `OMNIFOCUS_MCP_PORT` | `3050` | HTTP bind port. |
| `OMNIFOCUS_MCP_READ_ONLY` | `true` | Set to `false` to expose mutating upstream tools. |
| `OMNIFOCUS_MCP_UPSTREAM_COMMAND` | Node executable | Optional override for the stdio upstream command. |
| `OMNIFOCUS_MCP_UPSTREAM_ARGS` | dependency bin path | Optional override args. Supports JSON arrays or shell-like quoted strings. |

Configuration precedence is:

1. `.env` or `OMNIFOCUS_MCP_ENV_FILE`
2. real process environment variables

That means launchd, shell, or container/service-manager variables override
checked local dotenv values.

## Upstream Launch

The bridge resolves the installed package metadata at runtime:

1. `require.resolve("omnifocus-mcp-enhanced/package.json")`
2. read the package `bin` entry
3. resolve `omnifocus-mcp-enhanced -> cli.cjs` inside the dependency directory
4. start it as a child stdio MCP process with `node <bin-path>`

No upstream internals are imported. The upstream server stays local to the Mac,
and remote clients only see this bridge's authenticated Streamable HTTP endpoint.

To override the launch command:

```sh
OMNIFOCUS_MCP_UPSTREAM_COMMAND=node \
OMNIFOCUS_MCP_UPSTREAM_ARGS='["/absolute/path/to/custom/server.js"]' \
pnpm start
```

## Read-Only Mode

When `OMNIFOCUS_MCP_READ_ONLY` is unset or true, only these upstream tools are
exposed:

- `dump_database`
- `get_task_by_id`
- `read_task_attachment`
- `get_today_completed_tasks`
- `get_inbox_tasks`
- `get_flagged_tasks`
- `get_forecast_tasks`
- `get_tasks_by_tag`
- `filter_tasks`
- `list_custom_perspectives`
- `get_custom_perspective_tasks`

Known and future unknown tools are blocked by default in read-only mode. Set
`OMNIFOCUS_MCP_READ_ONLY=false` only on a private network and only when remote
mutation is intended.

## Usage

```sh
pnpm install
pnpm build

pnpm token:generate
pnpm start
```

The MCP endpoint is:

```text
http://127.0.0.1:3050/mcp
```

Clients must send:

```text
Authorization: Bearer replace-with-a-long-random-token
```

`pnpm token:generate` writes a random bearer token to
`.secrets/omnifocus-mcp-token` with private file permissions. It refuses to
overwrite an existing token unless you explicitly rotate it:

```sh
pnpm token:generate -- --force
```

The token value is not printed. Read it from `.secrets/omnifocus-mcp-token` when
configuring an MCP client.

The normal startup path does not require a `.env` file. Built-in defaults are:

- `OMNIFOCUS_MCP_HOST=127.0.0.1`
- `OMNIFOCUS_MCP_PORT=3050`
- `OMNIFOCUS_MCP_READ_ONLY=true`
- default upstream command resolved from the pinned `omnifocus-mcp-enhanced`
  dependency
- default token file `.secrets/omnifocus-mcp-token`

## Tailscale Serve

For authenticated remote access over tailnet HTTPS, use:

```sh
pnpm start:tailscale
```

This starts the local bridge on `127.0.0.1:${OMNIFOCUS_MCP_PORT:-3050}` and then
runs Tailscale Serve in the foreground:

```sh
tailscale serve --set-path /omnifocus-mcp http://127.0.0.1:3050/mcp
```

Do not add `--bg`; the wrapper keeps Tailscale Serve tied to the bridge process
lifecycle. If Tailscale Serve exits, the bridge exits. If the bridge receives
`SIGINT` or `SIGTERM`, the wrapper stops Tailscale Serve and closes the upstream
OmniFocus child process.

The remote MCP endpoint is:

```text
https://<mac-name>.<tailnet>.ts.net/omnifocus-mcp
```

The wrapper checks the current Tailscale Serve config before starting. It refuses
to overwrite an existing `/omnifocus-mcp` route, leaves unrelated Serve routes
alone, and never runs `tailscale serve reset`.

## Development

```sh
pnpm install
pnpm run format:check
pnpm run lint
pnpm test
pnpm build
```

The smoke tests use a fake stdio MCP child process. They do not launch
OmniFocus or call the real upstream package.

`pnpm start` is the convenience runner for local operation. It builds
`dist/index.js` when needed, then starts the bridge with the normal `.env` and
environment-variable loading rules.
