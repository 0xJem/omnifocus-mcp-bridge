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
- `OMNIFOCUS_MCP_TOKEN` is still supported for service managers that inject
  secrets directly, and it overrides `OMNIFOCUS_MCP_TOKEN_FILE`.
- The bridge refuses to start without either `OMNIFOCUS_MCP_TOKEN_FILE` or
  `OMNIFOCUS_MCP_TOKEN`.
- Every HTTP request must include `Authorization: Bearer <token>`.
- The default bind host is `127.0.0.1`.
- Bind `OMNIFOCUS_MCP_HOST` to a Tailscale/private interface when remote access is
  needed. Do not bind this service to a public interface.
- The bridge is read-only by default. Mutating OmniFocus tools are hidden and
  rejected unless `OMNIFOCUS_MCP_READ_ONLY=false` is set explicitly.
- `.env` is loaded automatically when present. Values already present in the
  process environment override `.env` values.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OMNIFOCUS_MCP_TOKEN_FILE` | none | Preferred path to a private file containing the bearer token. |
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

mkdir -p .secrets
umask 077
printf '%s\n' 'replace-with-a-long-random-token' > .secrets/omnifocus-mcp-token
cp .env.example .env
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
