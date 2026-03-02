# Google Search MCP Server

A Model Context Protocol (MCP) server that provides Google search capabilities by connecting to an existing Chromium browser via Chrome DevTools Protocol (CDP).

## Features

- **Real Google Search**: Performs actual Google searches using a real browser
- **Session Sharing**: Shares cookies and localStorage with the browser - login once, search authenticated
- **CAPTCHA Handling**: When CAPTCHA appears, waits for user to complete verification in the browser
- **Advanced Filtering**: Supports language, region, time range, search type, and more
- **Anti-Detection**: Uses headed browser mode to avoid bot detection

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Sandbox Container                      │
│                                                          │
│  ┌──────────────────┐                                   │
│  │  Chromium Browser │◄── User can interact via         │
│  │  (Headed + CDP)   │    https://sandboxdev.nx.run     │
│  │  Port: 9222       │                                   │
│  └────────┬─────────┘                                   │
│           │                                              │
│           │ CDP Connection                               │
│           │                                              │
│  ┌────────▼─────────┐    ┌──────────────────┐          │
│  │ google-search-mcp │    │  playwright-mcp   │          │
│  │    Port: 8933     │    │    Port: 8931     │          │
│  └──────────────────┘    └──────────────────┘          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Both MCP servers connect to the same Chromium instance, sharing:
- Cookies (Google login persists across searches)
- localStorage
- Browser session state

## Installation

### Prerequisites

- Node.js 18+
- Chromium browser running with CDP enabled on port 9222

### Setup

```bash
cd mcp/google-search-mcp
npm install
npm run build
```

### Running

```bash
npm start
# or
node dist/index.js
```

The server starts on `http://[::]:8933/mcp`

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/health` | GET | Health check |

### Tools

#### 1. `google_search`

Execute Google search and return structured results.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search keywords |
| `limit` | number | No | 10 | Max results (1-20) |
| `timeout` | number | No | 30000 | Timeout in ms (5000-120000) |
| `response_format` | string | No | "markdown" | Output format: "markdown" or "json" |
| `safe` | string | No | - | Safe search: "off", "medium", "high" |
| `language` | string | No | - | Language code (e.g., "en", "ja", "zh") |
| `region` | string | No | - | Region code (e.g., "us", "jp", "de") |
| `time_range` | string | No | - | Time filter: "any", "h", "d", "w", "m", "y" |
| `search_type` | string | No | - | Type: "all", "images", "news", "videos", "shopping" |
| `site` | string | No | - | Limit to domain (e.g., "github.com") |
| `file_type` | string | No | - | File type (e.g., "pdf", "doc") |
| `exact_phrase` | string | No | - | Exact phrase to match |
| `exclude_terms` | string[] | No | - | Terms to exclude |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "google_search",
    "arguments": {
      "query": "machine learning",
      "limit": 5,
      "time_range": "w",
      "site": "github.com"
    }
  }
}
```

#### 2. `google_search_html`

Get raw HTML of the search results page (cleaned, no CSS/JS).

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search keywords |
| `timeout` | number | No | 30000 | Timeout in ms |
| `safe` | string | No | - | Safe search level |
| `language` | string | No | - | Language code |
| `region` | string | No | - | Region code |
| `time_range` | string | No | - | Time filter |
| `search_type` | string | No | - | Search type |
| `site` | string | No | - | Domain filter |

## Usage Examples

### Basic Search

```bash
curl -X POST http://localhost:8933/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "google_search",
      "arguments": {
        "query": "OpenAI GPT-4",
        "limit": 5
      }
    }
  }'
```

### Search with Filters

```bash
# News from the past day in Japanese
curl -X POST http://localhost:8933/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "google_search",
      "arguments": {
        "query": "AI news",
        "search_type": "news",
        "time_range": "d",
        "language": "ja",
        "region": "jp"
      }
    }
  }'
```

### Search for PDF Files

```bash
curl -X POST http://localhost:8933/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "google_search",
      "arguments": {
        "query": "machine learning tutorial",
        "file_type": "pdf",
        "limit": 5
      }
    }
  }'
```

### Site-Specific Search

```bash
curl -X POST http://localhost:8933/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "google_search",
      "arguments": {
        "query": "react hooks",
        "site": "stackoverflow.com",
        "limit": 10
      }
    }
  }'
```

## Search Tips

Use these operators in your query for better results:

| Operator | Example | Description |
|----------|---------|-------------|
| `"..."` | `"machine learning"` | Exact phrase match |
| `site:` | `site:github.com` | Search within a site |
| `-` | `python -snake` | Exclude a term |
| `OR` | `Python OR JavaScript` | Either term |
| `filetype:` | `filetype:pdf` | Specific file type |
| `intitle:` | `intitle:tutorial` | Word in title |
| `inurl:` | `inurl:api` | Word in URL |

## Supported Languages

| Code | Language |
|------|----------|
| en | English |
| es | Spanish |
| fr | French |
| de | German |
| ja | Japanese |
| ko | Korean |
| zh | Chinese (Simplified) |
| zh-TW | Chinese (Traditional) |
| pt | Portuguese |
| ru | Russian |
| ar | Arabic |
| hi | Hindi |

## Supported Regions

| Code | Country |
|------|---------|
| us | United States |
| gb | United Kingdom |
| ca | Canada |
| au | Australia |
| de | Germany |
| fr | France |
| jp | Japan |
| kr | South Korea |
| cn | China |
| in | India |

## CAPTCHA Handling

When Google shows a CAPTCHA verification page:

1. The search automatically waits up to **2 minutes** for verification
2. Open the sandbox browser at `https://sandboxdev.nx.run`
3. Complete the CAPTCHA in the browser
4. The search will automatically continue after verification

If timeout occurs, an error message with instructions is returned.

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "No browser context available" | Chromium not running | Ensure Chromium is started with CDP |
| "Timeout" | Page load timeout or CAPTCHA | Check browser, complete CAPTCHA if shown |
| "Cannot find search input" | Google page structure changed | Update selectors |

## Development

### Project Structure

```
google-search-mcp/
├── src/
│   ├── index.ts      # MCP server entry point
│   ├── search.ts     # Search logic and browser interaction
│   └── types.ts      # TypeScript type definitions
├── dist/             # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npx tsc --noEmit
```

## Deployment (Kubernetes)

The server is deployed as part of the sandbox container:

```yaml
# Service exposes port 8933
- name: google-search-mcp
  port: 8933
  targetPort: 8933
```

Access within cluster:
```
http://sandbox.dev.svc.cluster.local:8933/mcp
```

## License

MIT
