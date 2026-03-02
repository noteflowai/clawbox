/**
 * google-search plugin for openclaw
 *
 * Exposes google_search and google_search_html as native openclaw tools
 * by bridging to the google-search-mcp SSE server via mcporter.
 *
 * Requires:
 *   - google-search-mcp running on localhost:8933
 *   - mcporter installed globally (npm install -g mcporter)
 *   - ~/.mcporter/mcporter.json with "google" server registered
 */

import { spawn } from "node:child_process";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../src/plugins/types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

async function runMcporter(
  args: string[],
  opts: { timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("mcporter", args, {
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`mcporter timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`mcporter failed (code ${code}): ${stderr || stdout}`));
    });
  });
}

/** Extract the text content from an MCP tool result */
function extractText(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "content" in parsed &&
      Array.isArray((parsed as Record<string, unknown>).content)
    ) {
      const parts = (parsed as { content: Array<{ type: string; text?: string }> }).content;
      return parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n");
    }
  } catch {
    // not JSON — return as-is
  }
  return raw.trim();
}

// ── tool factories ────────────────────────────────────────────────────────────

function createGoogleSearchTool() {
  const googleSearchSchema = Type.Object({
    query: Type.String({ description: "Search keywords" }),
    limit: Type.Optional(Type.Number({ description: "Max results (default 10)", default: 10 })),
    language: Type.Optional(Type.String({ description: "Language code, e.g. 'en', 'zh'" })),
    region: Type.Optional(Type.String({ description: "Region code, e.g. 'us', 'cn'" })),
    safe: Type.Optional(Type.String({ description: "'off', 'medium', or 'high'" })),
    response_format: Type.Optional(
      Type.String({ description: "'markdown' (default) or 'json'" }),
    ),
  });

  return {
    name: "google_search",
    description:
      "Search Google and return results via the google-search-mcp server. " +
      "Use this for real-time web search, news, and information retrieval.",
    parameters: googleSearchSchema,
    async execute(params) {
      const args: Record<string, unknown> = { query: params.query };
      if (params.limit !== undefined) args.limit = params.limit;
      if (params.language) args.language = params.language;
      if (params.region) args.region = params.region;
      if (params.safe) args.safe = params.safe;
      if (params.response_format) args.response_format = params.response_format;

      const result = await runMcporter(
        ["call", "google.google_search", "--args", JSON.stringify(args), "--output", "json"],
        { timeoutMs: 35_000 },
      );
      return extractText(result.stdout);
    },
  };
}

function createGoogleSearchHtmlTool() {
  const googleSearchHtmlSchema = Type.Object({
    query: Type.String({ description: "Search keywords" }),
    language: Type.Optional(Type.String({ description: "Language code, e.g. 'en', 'zh'" })),
    region: Type.Optional(Type.String({ description: "Region code, e.g. 'us', 'cn'" })),
    safe: Type.Optional(Type.String({ description: "'off', 'medium', or 'high'" })),
  });

  return {
    name: "google_search_html",
    description:
      "Fetch the raw HTML of a Google search results page. " +
      "Useful when structured results are insufficient or you need full page content.",
    parameters: googleSearchHtmlSchema,
    async execute(params) {
      const args: Record<string, unknown> = { query: params.query };
      if (params.language) args.language = params.language;
      if (params.region) args.region = params.region;
      if (params.safe) args.safe = params.safe;

      const result = await runMcporter(
        ["call", "google.google_search_html", "--args", JSON.stringify(args), "--output", "json"],
        { timeoutMs: 35_000 },
      );
      return extractText(result.stdout);
    },
  };
}

// ── plugin entry point ────────────────────────────────────────────────────────

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    () => createGoogleSearchTool() as unknown as import("../../src/agents/tools/common.js").AnyAgentTool,
    { optional: false },
  );
  api.registerTool(
    () => createGoogleSearchHtmlTool() as unknown as import("../../src/agents/tools/common.js").AnyAgentTool,
    { optional: false },
  );
}
