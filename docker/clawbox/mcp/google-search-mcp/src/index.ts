#!/usr/bin/env node
/**
 * Google Search MCP Server
 * 
 * Provides Google search capabilities via MCP protocol.
 * Connects to existing Chromium via CDP to share cookies and localStorage.
 * 
 * Tools:
 *   - google_search: Execute Google search and return results
 *   - google_search_html: Get raw HTML of search results page
 * 
 * Endpoint: http://[::]:8933/mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import { googleSearch, getGoogleSearchPageHtml } from "./search.js";
import { ResponseFormat, SearchResult, SafeSearch, TimeRange, SearchType, LANGUAGE_CODES, REGION_CODES } from "./types.js";

const PORT = 8933;

// Create MCP server
const server = new McpServer({
  name: "google-search-mcp-server",
  version: "1.0.0"
});

/**
 * Format search results as Markdown
 */
function formatResultsAsMarkdown(query: string, results: SearchResult[]): string {
  const lines = [
    `# Google Search Results: "${query}"`,
    "",
    `Found ${results.length} results`,
    ""
  ];
  
  results.forEach((result, index) => {
    lines.push(`## ${index + 1}. ${result.title}`);
    lines.push("");
    lines.push(`**URL**: ${result.link}`);
    if (result.snippet) {
      lines.push("");
      lines.push(`**Snippet**: ${result.snippet}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  });
  
  return lines.join("\n");
}

// Register Tool 1: google_search
server.tool(
  "google_search",
  `Execute Google search with advanced filtering options. Uses browser's existing cookies/session for authentication.

This tool performs real-time Google searches using the browser's authenticated session, allowing searches with logged-in Google account benefits.

**Basic Search Tips:**
- Use English for broader/better results
- Use quotes for exact phrase: "machine learning"
- Use site: to limit domain: site:github.com
- Use - to exclude terms: python -snake
- Use OR for alternatives: (Python OR JavaScript) tutorial
- Use filetype: for specific files: filetype:pdf

**Available Languages:** ${Object.entries(LANGUAGE_CODES).map(([k, v]) => `${k} (${v})`).join(', ')}

**Available Regions:** ${Object.entries(REGION_CODES).map(([k, v]) => `${k} (${v})`).join(', ')}`,
  {
    query: z.string()
      .min(1, "Query cannot be empty")
      .max(500, "Query too long")
      .describe("Search keywords"),
    limit: z.number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum results to return (default: 10)"),
    timeout: z.number()
      .int()
      .min(5000)
      .max(120000)
      .default(30000)
      .describe("Timeout in milliseconds (default: 30000)"),
    response_format: z.nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' (default) or 'json'"),
    safe: z.nativeEnum(SafeSearch)
      .optional()
      .describe("Safe search level: 'off', 'medium', or 'high'"),
    language: z.string()
      .optional()
      .describe("Language code for results (e.g., 'en', 'es', 'ja', 'zh')"),
    region: z.string()
      .optional()
      .describe("Region/country code (e.g., 'us', 'gb', 'jp', 'de')"),
    time_range: z.nativeEnum(TimeRange)
      .optional()
      .describe("Time filter: 'any', 'h' (hour), 'd' (day), 'w' (week), 'm' (month), 'y' (year)"),
    search_type: z.nativeEnum(SearchType)
      .optional()
      .describe("Search type: 'all' (web), 'images', 'news', 'videos', 'shopping'"),
    exact_phrase: z.string()
      .optional()
      .describe("Exact phrase to match (will be quoted automatically)"),
    site: z.string()
      .optional()
      .describe("Limit search to specific domain (e.g., 'github.com', 'reddit.com')"),
    file_type: z.string()
      .optional()
      .describe("File type to search for (e.g., 'pdf', 'doc', 'xls', 'ppt')"),
    exclude_terms: z.array(z.string())
      .optional()
      .describe("Terms to exclude from search results")
  },
  async ({ query, limit, timeout, response_format, safe, language, region, time_range, search_type, exact_phrase, site, file_type, exclude_terms }) => {
    try {
      const response = await googleSearch(query, { 
        limit, 
        timeout,
        safe,
        language,
        region,
        timeRange: time_range,
        searchType: search_type,
        exactPhrase: exact_phrase,
        site,
        fileType: file_type,
        excludeTerms: exclude_terms
      });
      
      let text: string;
      if (response_format === ResponseFormat.MARKDOWN) {
        text = formatResultsAsMarkdown(response.query, response.results);
      } else {
        text = JSON.stringify(response, null, 2);
      }
      
      return { 
        content: [{ type: "text", text }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[google_search] Error: ${errorMessage}`);
      
      // Provide helpful message for CAPTCHA timeout
      let helpMessage = "";
      if (errorMessage.includes("Timeout") || errorMessage.includes("timeout")) {
        helpMessage = `\n\n**CAPTCHA Verification Required**
If Google is showing a CAPTCHA verification page, please:
1. Open webtop browser: https://webtopdev.nx.run
2. Complete the CAPTCHA verification in the browser
3. Retry this search

The search will automatically wait up to 2 minutes for you to complete verification.`;
      }
      
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Search failed: ${errorMessage}${helpMessage}` 
        }]
      };
    }
  }
);

// Register Tool 2: google_search_html
server.tool(
  "google_search_html",
  `Get raw HTML content of Google search results page. Useful for custom parsing, debugging, or when structured extraction fails.

This tool returns the cleaned HTML (CSS and JavaScript removed) of the Google search results page.
Supports all the same filtering options as google_search.`,
  {
    query: z.string()
      .min(1, "Query cannot be empty")
      .max(500, "Query too long")
      .describe("Search keywords"),
    timeout: z.number()
      .int()
      .min(5000)
      .max(120000)
      .default(30000)
      .describe("Timeout in milliseconds (default: 30000)"),
    safe: z.nativeEnum(SafeSearch)
      .optional()
      .describe("Safe search level: 'off', 'medium', or 'high'"),
    language: z.string()
      .optional()
      .describe("Language code for results (e.g., 'en', 'es', 'ja')"),
    region: z.string()
      .optional()
      .describe("Region/country code (e.g., 'us', 'gb', 'jp')"),
    time_range: z.nativeEnum(TimeRange)
      .optional()
      .describe("Time filter: 'any', 'h' (hour), 'd' (day), 'w' (week), 'm' (month), 'y' (year)"),
    search_type: z.nativeEnum(SearchType)
      .optional()
      .describe("Search type: 'all' (web), 'images', 'news', 'videos', 'shopping'"),
    site: z.string()
      .optional()
      .describe("Limit search to specific domain")
  },
  async ({ query, timeout, safe, language, region, time_range, search_type, site }) => {
    try {
      const response = await getGoogleSearchPageHtml(query, { 
        timeout,
        safe,
        language,
        region,
        timeRange: time_range,
        searchType: search_type,
        site
      });
      
      const result = {
        query: response.query,
        url: response.url,
        htmlLength: response.html.length,
        originalHtmlLength: response.originalHtmlLength,
        html: response.html
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[google_search_html] Error: ${errorMessage}`);
      
      // Provide helpful message for CAPTCHA timeout
      let helpMessage = "";
      if (errorMessage.includes("Timeout") || errorMessage.includes("timeout")) {
        helpMessage = `\n\n**CAPTCHA Verification Required**
If Google is showing a CAPTCHA verification page, please:
1. Open webtop browser: https://webtopdev.nx.run
2. Complete the CAPTCHA verification in the browser
3. Retry this search

The search will automatically wait up to 2 minutes for you to complete verification.`;
      }
      
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Failed to get HTML: ${errorMessage}${helpMessage}` 
        }]
      };
    }
  }
);

// Create Express app
const app = express();
app.use(express.json());

// MCP endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    
    res.on('close', () => {
      transport.close();
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] Request handling error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    service: 'google-search-mcp-server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '::', () => {
  console.log(`[google-search-mcp] Server running on http://[::]:${PORT}/mcp`);
  console.log(`[google-search-mcp] Health check: http://[::]:${PORT}/health`);
  console.log(`[google-search-mcp] CDP endpoint: http://127.0.0.1:9222`);
});
