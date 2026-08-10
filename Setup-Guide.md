# Setup & Update Guide — Indian Options Tool (personal, self-hosted)

*No coding required. Just copy-paste the commands below.*

---

## What this is
A personal tool that runs on **your** computer and feeds Indian options data + analytics into Claude Desktop. It uses the **free** NSE data source (no account, no cost).

## Before you start — install Node
You need Node.js 20 or newer.
1. Go to https://nodejs.org and download the **LTS** version.
2. Install it like any normal program (next-next-finish).
3. To confirm it worked, open a terminal and type: `node --version`
   - You should see something like `v20.x.x` or `v22.x.x`.

## Option A — Easiest (zero install, recommended)
Claude Desktop already knows how to fetch and run this tool. Just tell Claude to add it, or edit your Claude config to include:

```json
{
  "mcpServers": {
    "indian-options": {
      "command": "npx",
      "args": ["-y", "indian-option-mcp"]
    }
  }
}
```
Restart Claude Desktop. Done.

## Option B — Run from the code (if you want control / to update)
Open a terminal in the project folder and run, one line at a time:

```bash
npm install
npm run build
```

Then point Claude Desktop at the built file (path depends on your system):

```json
{
  "mcpServers": {
    "indian-options": {
      "command": "node",
      "args": ["/full/path/to/Indian-Option-MCP/dist/bundle.mjs"],
      "env": { "DATA_PROVIDER": "nse" }
    }
  }
}
```

## Option C — Native Windows .exe (no Node needed) — Windows only
The project now **automatically builds a single `indian-option-mcp.exe` file** whenever the code is updated (via GitHub Actions). This is the simplest option if you're on Windows and don't want to install Node at all.

**Get the .exe:**
1. Go to the GitHub repo and open the **Actions** tab.
2. Click the latest workflow run named "Build Windows .exe".
3. On the run page, find **Artifacts** and download `indian-option-mcp-windows` (it's a zip).
4. Unzip it — inside is `indian-option-mcp.exe`. Put it somewhere you'll remember (e.g. `C:\Tools\`).

**Point Claude Desktop at it:**
```json
{
  "mcpServers": {
    "indian-options": {
      "command": "C:\\Tools\\indian-option-mcp.exe",
      "env": { "DATA_PROVIDER": "nse" }
    }
  }
}
```
Note: there is **no `node` and no `args`** here — the `.exe` *is* the whole program.

## Keeping it updated
- **Option A:** restart Claude Desktop — it fetches the latest automatically.
- **Option B:** in the project folder run `git pull` then `npm install && npm run build`.
- **Option C (.exe):** re-download the artifact from the latest Actions run — a fresh `.exe` is built on every update.

## Settings you can change (optional)
Create a file named `.env` next to the project with lines like:

```
DATA_PROVIDER=nse
CACHE_TTL_SECONDS=5
RISK_FREE_RATE=0.07
LOG_LEVEL=info
```

These are now actually used by the tool (previously they were ignored — fixed).

## If something goes wrong
- **"No data" / empty results:** NSE occasionally blocks automated access. Wait a minute and retry. The tool now reports a clear error instead of failing silently.
- **Tool doesn't appear in Claude:** check the `mcpServers` config path is correct and restart Claude.
- **Node error on start:** make sure Node is version 20+ (`node --version`).
- **.exe won't start / antivirus warning:** some antivirus tools flag freshly-built `.exe` files. If it's blocked, allow it (or re-download) and make sure the file has internet access — it needs to fetch market data.

## Recent stability fixes applied
- Settings file is now wired in (your preferences are actually used).
- One consistent source for choosing the data provider (no conflicting logic).
- Clear error messages when the data source is unavailable.
