# AGENTS.md

本文件定义 Codex 在 `AiToEarn` 仓库内的默认工作规则。

## Communication

- 默认使用简体中文回复。

## Project Layout

- `project/aitoearn-backend` 是 Nx + pnpm 后端工作区。
- `project/aitoearn-web` 是 Next.js + pnpm 前端项目。
- 根目录主要维护 README、Docker 部署文档、`docker-compose.yml` 和展示资源。

## Package & Command Rules

- backend/web 使用 `pnpm`。
- 根目录没有统一 package，不要在根目录随手执行 install/build。
- backend 改动优先在 `project/aitoearn-backend` 用 `pnpm nx ...` 验证，并遵循 `project/aitoearn-backend/CLAUDE.md`。
- web 改动在 `project/aitoearn-web` 验证，优先使用 `pnpm run type-check` 和 `pnpm build`。
- 纯文档改动至少运行 `git diff --check`。

## Documentation Rules

- 根 README 对外文档包含 `README.md`、`README_EN.md`、`README_JA.md`；涉及用户可见能力、安装、OpenClaw、MCP、Relay、API Key 或环境地址时默认三语同步。
- Docker 部署说明涉及生产部署、环境变量或 `docker compose` 时，同步检查 `DOCKER_DEPLOYMENT_CN.md` 和 `DOCKER_DEPLOYMENT_EN.md`。
- README 类改动保持最小可用改写，不要把参考文档整段复制进来。
- 用户可见 README、skill、capability reference 只写当前能力与环境规则，不写 `dev`、测试环境、验证日期等来源说明。

## Environment Rules

- OpenClaw、MCP、Relay 都必须明确区分中国版和国际版环境：`*.aitoearn.cn` 属于中国版，`*.aitoearn.ai` 属于国际版。
- 中国版 API Key 只能搭配 `aitoearn.cn` 相关 URL；国际版 API Key 只能搭配 `aitoearn.ai` 相关 URL。环境和 Key 不匹配会导致 401。
- MCP 示例需要按环境区分 `https://aitoearn.cn/api/unified/mcp` / `https://aitoearn.ai/api/unified/mcp`，SSE 示例同理区分 `/api/unified/sse`。
- Relay 示例需要按 `RELAY_API_KEY` 来源选择 `RELAY_SERVER_URL`：中国版使用 `https://aitoearn.cn/api`，国际版使用 `https://aitoearn.ai/api`。

## SocialOps Local Runtime Rules

- `https://socialops.bebio.site` must be served by `project/aitoearn-web` production runtime, not `next dev`.
- Use `npm run live` in `project/aitoearn-web` for public tunnel work; it rebuilds cleanly, starts `next start -p 6061`, keeps Cloudflare tunnel live, and warms key routes.
- Never run `next build` while `next dev/start -p 6061` is serving the public tunnel. Stop it first to avoid stale `.next` chunks and browser server errors.
- After runtime/config changes, verify localhost and public URL for `/`, `/healthz`, `/en/accounts`, and `/api/v2/channels/accounts`.

## Multi-Agent Coordination Rules

- Before running, stopping, rebuilding, or restarting SocialOps, every agent must read `AGENT_COORDINATION.md`.
- Runtime mutations require a claim in `AGENT_COORDINATION.md` with agent name, purpose, PID when available, start time, and touched surface.
- Only one agent may own `.next`, port `6061`, or the Cloudflare tunnel at a time. Other agents may edit disjoint files but must not run `next dev`, `next build`, `next start`, or kill runtime processes.
- Public port `6061` is production-only. Development servers must use another port and must never point the public tunnel at their `.next`.
- Before claiming runtime, verify the recorded PID/process. A claim is stale only when its process is dead or the entry is older than 30 minutes with no update. Mark stale entries released; do not silently overwrite active ownership.
- After runtime work, update the verification result and release the claim. Keep only active claims plus the latest 10 completed entries; prune older completed entries periodically.
- Build from a clean `.next` only after the runtime owner has stopped port `6061`. Never build concurrently with another agent or watcher.
