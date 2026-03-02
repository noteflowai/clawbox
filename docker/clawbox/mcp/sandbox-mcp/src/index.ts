#!/usr/bin/env node
/**
 * Sandbox MCP Server
 * 
 * Provides a secure, isolated Linux sandbox environment with full desktop GUI capabilities.
 * This sandbox runs in a separate container/VM, completely isolated from your local machine.
 * 
 * The sandbox provides:
 * - A full Linux desktop environment (XFCE) with GUI applications
 * - Chromium browser with CDP support for web automation
 * - Shell access, filesystem operations, and code execution
 * - Complete isolation - safe to run untrusted code or browse untrusted websites
 * 
 * URL Query Parameters:
 *   gui_tools=on/off  - Enable GUI mode tools (Mouse, Keyboard, Window, Screenshot) - default: on
 *   cli_tools=on/off  - Enable CLI mode tools (Shell, Filesystem, Code Execution) - default: off
 * 
 * Tools:
 *   GUI Mode (16): Mouse, Keyboard, Window, Screenshot, Launch, Wait
 *   CLI Mode (12): Shell (2), Filesystem (5), Code Execution (5)
 * 
 * Endpoint: http://[::]:8888/mcp?gui_tools=on&cli_tools=on
 * Health: http://[::]:8888/health
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import { DesktopController } from "./desktop.js";
import { CodeExecutor } from "./code-executor.js";

const PORT = 8888;
const desktop = new DesktopController();
const codeExecutor = new CodeExecutor();

console.log(`[sandbox-mcp] Starting Sandbox MCP Server...`);
console.log(`[sandbox-mcp] Tool modes controlled via URL parameters:`);
console.log(`[sandbox-mcp]   gui_tools=on (default) - Desktop automation tools`);
console.log(`[sandbox-mcp]   cli_tools=off (default) - Shell, FS, Code tools`);

/**
 * Tool definitions for different modes
 */
interface ToolMode {
  guiTools: boolean;
  cliTools: boolean;
}

/**
 * Parse URL query parameters to determine tool modes
 */
function parseToolModes(query: Record<string, any>): ToolMode {
  // Default: gui_tools=on, cli_tools=off
  const guiTools = query.gui_tools !== 'off';  // on by default
  const cliTools = query.cli_tools === 'on';   // off by default
  
  return { guiTools, cliTools };
}

/**
 * Register GUI tools (Desktop automation) on an MCP server
 */
function registerGuiTools(server: McpServer): void {
  // ============ Mouse Tools ============

  server.tool(
    "sandbox_mouse_click",
    `[SANDBOX] Perform mouse click in the isolated sandbox desktop environment.
The sandbox is a secure, isolated Linux desktop - completely separate from your local machine.`,
    {
      button: z.enum(['left', 'right', 'middle'])
        .optional()
        .describe("Mouse button (default: left)"),
      x: z.number()
        .optional()
        .describe("X coordinate"),
      y: z.number()
        .optional()
        .describe("Y coordinate")
    },
    async ({ button, x, y }) => {
      try {
        await desktop.mouseClick(button || 'left', x, y);
        return {
          content: [{ type: "text", text: "Mouse click performed" }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Mouse click failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_mouse_double_click",
    `[SANDBOX] Perform mouse double click in the isolated sandbox desktop.`,
    {
      x: z.number()
        .optional()
        .describe("X coordinate"),
      y: z.number()
        .optional()
        .describe("Y coordinate")
    },
    async ({ x, y }) => {
      try {
        await desktop.mouseDoubleClick(x, y);
        return {
          content: [{ type: "text", text: "Mouse double click performed" }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Mouse double click failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_mouse_move",
    `[SANDBOX] Move mouse cursor to specified coordinates in the sandbox desktop.`,
    {
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate")
    },
    async ({ x, y }) => {
      try {
        await desktop.mouseMove(x, y);
        return {
          content: [{ type: "text", text: `Mouse moved to (${x}, ${y})` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Mouse move failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_mouse_scroll",
    `[SANDBOX] Perform mouse scroll action in the sandbox desktop.`,
    {
      direction: z.enum(['up', 'down']).describe("Scroll direction"),
      amount: z.number()
        .optional()
        .describe("Scroll amount (default: 1)")
    },
    async ({ direction, amount }) => {
      try {
        await desktop.mouseScroll(direction, amount || 1);
        return {
          content: [{ type: "text", text: `Mouse scrolled ${direction} ${amount || 1} time(s)` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Mouse scroll failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_mouse_drag",
    `[SANDBOX] Perform mouse drag from one position to another in the sandbox desktop.`,
    {
      fromX: z.number().describe("Starting X coordinate"),
      fromY: z.number().describe("Starting Y coordinate"),
      toX: z.number().describe("Ending X coordinate"),
      toY: z.number().describe("Ending Y coordinate")
    },
    async ({ fromX, fromY, toX, toY }) => {
      try {
        await desktop.mouseDrag(fromX, fromY, toX, toY);
        return {
          content: [{ type: "text", text: `Mouse dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Mouse drag failed: ${errorMessage}` }]
        };
      }
    }
  );

  // ============ Keyboard Tools ============

  server.tool(
    "sandbox_keyboard_type",
    `[SANDBOX] Type text using keyboard input in the sandbox desktop.
Automatically handles non-ASCII characters (Chinese, Japanese, emoji, etc.) via clipboard.`,
    {
      text: z.string().describe("Text to type"),
      delay: z.number()
        .min(1)
        .max(25)
        .optional()
        .describe("Typing delay in milliseconds (1-25, default: 12)"),
      useClipboard: z.boolean()
        .optional()
        .describe("Force clipboard method even for ASCII text (default: false)")
    },
    async ({ text, delay, useClipboard }) => {
      try {
        await desktop.keyboardType(text, { delay, useClipboard });
        return {
          content: [{ type: "text", text: "Text typed successfully" }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Keyboard type failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_keyboard_press",
    `[SANDBOX] Press a specific key in the sandbox desktop.

Common keys: Return, Escape, Tab, space, BackSpace, Delete, Left, Right, Up, Down, F1-F12`,
    {
      key: z.string().describe("Key to press (e.g., Return, Escape, Tab)")
    },
    async ({ key }) => {
      try {
        await desktop.keyboardPress(key);
        return {
          content: [{ type: "text", text: `Key '${key}' pressed` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Keyboard press failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_keyboard_combo",
    `[SANDBOX] Press key combination/shortcut in the sandbox desktop.

Examples: ['ctrl', 'c'] for copy, ['ctrl', 'v'] for paste, ['alt', 'Tab'] for switch window`,
    {
      keys: z.array(z.string()).describe("Array of keys for combination (e.g., ['ctrl', 'c'])")
    },
    async ({ keys }) => {
      try {
        await desktop.keyboardCombo(keys);
        return {
          content: [{ type: "text", text: `Key combination '${keys.join('+')}' pressed` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Keyboard combo failed: ${errorMessage}` }]
        };
      }
    }
  );

  // ============ Window Tools ============

  server.tool(
    "sandbox_get_windows",
    `[SANDBOX] Get list of all windows in the sandbox desktop with their class names, titles, and IDs.`,
    {
      includeMinimized: z.boolean()
        .optional()
        .describe("Include minimized windows (default: false)")
    },
    async ({ includeMinimized }) => {
      try {
        const windows = await desktop.getAllWindows(includeMinimized || false);
        return {
          content: [{ type: "text", text: JSON.stringify(windows, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Get windows failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_switch_window",
    `[SANDBOX] Switch to and focus a specific window in the sandbox desktop.`,
    {
      windowId: z.string().describe("Window ID to switch to (from sandbox_get_windows)")
    },
    async ({ windowId }) => {
      try {
        const success = await desktop.switchToWindow(windowId);
        return {
          content: [{ type: "text", text: JSON.stringify({ success }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Switch window failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_maximize_window",
    `[SANDBOX] Maximize a specific window in the sandbox desktop.`,
    {
      windowId: z.string().describe("Window ID to maximize")
    },
    async ({ windowId }) => {
      try {
        const success = await desktop.maximizeWindow(windowId);
        return {
          content: [{ type: "text", text: JSON.stringify({ success }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Maximize window failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_minimize_window",
    `[SANDBOX] Minimize a specific window in the sandbox desktop.`,
    {
      windowId: z.string().describe("Window ID to minimize")
    },
    async ({ windowId }) => {
      try {
        const success = await desktop.minimizeWindow(windowId);
        return {
          content: [{ type: "text", text: JSON.stringify({ success }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Minimize window failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_resize_window",
    `[SANDBOX] Resize a specific window in the sandbox desktop.`,
    {
      windowId: z.string().describe("Window ID to resize"),
      width: z.number().describe("New width in pixels"),
      height: z.number().describe("New height in pixels")
    },
    async ({ windowId, width, height }) => {
      try {
        const success = await desktop.resizeWindow(windowId, width, height);
        return {
          content: [{ type: "text", text: JSON.stringify({ success }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Resize window failed: ${errorMessage}` }]
        };
      }
    }
  );

  // ============ Screenshot and Application Tools ============

  server.tool(
    "sandbox_screenshot",
    `[SANDBOX] Take a screenshot of the sandbox desktop. Returns PNG image data.
Use this to see what's currently displayed on the isolated sandbox screen.`,
    {},
    async () => {
      try {
        console.log('[sandbox-mcp] Taking screenshot...');
        const imageData = await desktop.takeScreenshot();
        console.log(`[sandbox-mcp] Screenshot taken, size: ${imageData.length} bytes`);
        
        return {
          content: [{
            type: "image",
            data: imageData.toString('base64'),
            mimeType: "image/png"
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[sandbox-mcp] Screenshot failed:', errorMessage);
        return {
          isError: true,
          content: [{ type: "text", text: `Screenshot failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_launch_app",
    `[SANDBOX] Launch an application in the sandbox desktop.

Common applications: chromium, firefox, xfce4-terminal, thunar (file manager), gedit (text editor)`,
    {
      appName: z.string().describe("Application name to launch (desktop entry name)")
    },
    async ({ appName }) => {
      try {
        await desktop.launchApplication(appName);
        return {
          content: [{ type: "text", text: `Application '${appName}' launched` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Launch app failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_wait",
    `[SANDBOX] Wait for specified number of seconds. Useful for waiting for UI animations or page loads in the sandbox.`,
    {
      seconds: z.number()
        .min(0.1)
        .max(60)
        .describe("Number of seconds to wait (0.1-60)")
    },
    async ({ seconds }) => {
      try {
        await desktop.wait(seconds);
        return {
          content: [{ type: "text", text: `Waited for ${seconds} seconds` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Wait failed: ${errorMessage}` }]
        };
      }
    }
  );
}

/**
 * Register CLI tools (Shell, Filesystem, Code Execution) on an MCP server
 * These tools operate on the isolated sandbox environment, not the local machine.
 */
function registerCliTools(server: McpServer): void {
  // ============ Shell Tools ============

  server.tool(
    "sandbox_shell",
    `[SANDBOX] Run a shell command in the isolated sandbox Linux environment.

This executes commands in a secure, isolated sandbox container - completely separate from your local machine.
Use this when you need to:
- Execute commands in the sandbox where GUI applications run
- Install packages or configure the sandbox environment  
- Run scripts that need to interact with sandbox applications
- Access files within the sandbox (/home/core)

This is safe for running untrusted code as it's fully isolated.
DO NOT use this for local development tasks - use your local shell tools instead.

Returns stdout, stderr, and exit code. Working directory: /home/core`,
    {
      command: z.string().describe("Shell command to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Timeout in milliseconds (default: 30000)")
    },
    async ({ command, timeout }) => {
      try {
        const result = await desktop.shellRun(command, timeout || 30000);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Shell run failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_shell_background",
    `[SANDBOX] Run a shell command in background in the isolated sandbox.
Use this for starting long-running processes in the sandbox, such as servers or services.
Returns the process ID and any initial output.`,
    {
      command: z.string().describe("Command to execute in background in the sandbox"),
      waitMs: z.number()
        .optional()
        .describe("Milliseconds to wait for initial output (default: 2000)")
    },
    async ({ command, waitMs }) => {
      try {
        const result = await desktop.shellRunBackground(command, waitMs || 2000);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Shell background run failed: ${errorMessage}` }]
        };
      }
    }
  );

  // ============ Filesystem Tools ============

  server.tool(
    "sandbox_fs_list",
    `[SANDBOX] List files in a directory within the isolated sandbox environment.
This browses the sandbox filesystem, not your local machine.
Returns name, type, size, and modification time.`,
    {
      path: z.string().describe("Directory path in the sandbox to list")
    },
    async ({ path }) => {
      try {
        const files = await desktop.fsList(path);
        return {
          content: [{ type: "text", text: JSON.stringify(files, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `List directory failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_fs_read",
    `[SANDBOX] Read the contents of a file within the isolated sandbox environment.
This reads files from the sandbox filesystem, not your local machine.`,
    {
      path: z.string().describe("File path in the sandbox to read")
    },
    async ({ path }) => {
      try {
        const content = await desktop.fsRead(path);
        return {
          content: [{ type: "text", text: content }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Read file failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_fs_write",
    `[SANDBOX] Write content to a file within the isolated sandbox environment.
This modifies the sandbox filesystem, not your local machine.
Creates the file if it doesn't exist.`,
    {
      path: z.string().describe("File path in the sandbox to write to"),
      content: z.string().describe("Content to write")
    },
    async ({ path, content }) => {
      try {
        await desktop.fsWrite(path, content);
        return {
          content: [{ type: "text", text: `File written successfully: ${path}` }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Write file failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_fs_info",
    `[SANDBOX] Get detailed information about a file or directory in the sandbox.`,
    {
      path: z.string().describe("File or directory path in the sandbox")
    },
    async ({ path }) => {
      try {
        const info = await desktop.fsInfo(path);
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Get file info failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_fs_watch",
    `[SANDBOX] Watch a directory for changes in the sandbox environment.
Useful for monitoring file changes during GUI operations or code execution.`,
    {
      path: z.string().describe("Directory path in the sandbox to watch"),
      timeout: z.number()
        .optional()
        .describe("Watch duration in milliseconds (default: 5000)")
    },
    async ({ path, timeout }) => {
      try {
        const events = await desktop.fsWatch(path, timeout || 5000);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              path,
              duration: timeout || 5000,
              events
            }, null, 2) 
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Watch directory failed: ${errorMessage}` }]
        };
      }
    }
  );

  // ============ Code Execution Tools ============

  server.tool(
    "sandbox_exec_python",
    `[SANDBOX] Execute Python 3 code in the isolated sandbox environment.

This runs Python code in a secure, isolated sandbox - safe for running untrusted code.
Use this when you need to:
- Run Python scripts that interact with sandbox GUI applications
- Test code in an isolated environment
- Execute data processing or automation scripts in the sandbox

The code runs in a temporary file with a 30-second default timeout.`,
    {
      code: z.string().describe("Python code to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 30000)")
    },
    async ({ code, timeout }) => {
      try {
        const result = await codeExecutor.executePython(code, { timeout });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Python execution failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_exec_bash",
    `[SANDBOX] Execute a Bash script in the isolated sandbox environment.

This runs shell scripts in a secure, isolated sandbox.
Use for complex multi-command operations in the sandbox.
Working directory is /home/core.`,
    {
      code: z.string().describe("Bash script to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 30000)")
    },
    async ({ code, timeout }) => {
      try {
        const result = await codeExecutor.executeBash(code, { timeout });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Bash execution failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_exec_javascript",
    `[SANDBOX] Execute JavaScript or TypeScript code in the isolated sandbox environment.

This runs JS/TS code via Node.js in a secure, isolated sandbox.
TypeScript code is auto-detected and executed via ts-node.`,
    {
      code: z.string().describe("JavaScript/TypeScript code to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 30000)")
    },
    async ({ code, timeout }) => {
      try {
        const result = await codeExecutor.executeTypeScript(code, { timeout });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `JavaScript/TypeScript execution failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_exec_java",
    `[SANDBOX] Execute Java code in the isolated sandbox environment.

This compiles and runs Java code in a secure, isolated sandbox.
If the code doesn't contain a class definition, it will be wrapped in a Main class.`,
    {
      code: z.string().describe("Java code to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 30000)")
    },
    async ({ code, timeout }) => {
      try {
        const result = await codeExecutor.executeJava(code, { timeout });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Java execution failed: ${errorMessage}` }]
        };
      }
    }
  );

  server.tool(
    "sandbox_exec_r",
    `[SANDBOX] Execute R code in the isolated sandbox environment.

This runs R scripts via Rscript in a secure, isolated sandbox.
Useful for data analysis tasks that may produce visualizations.`,
    {
      code: z.string().describe("R code to execute in the sandbox"),
      timeout: z.number()
        .optional()
        .describe("Execution timeout in milliseconds (default: 30000)")
    },
    async ({ code, timeout }) => {
      try {
        const result = await codeExecutor.executeR(code, { timeout });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `R execution failed: ${errorMessage}` }]
        };
      }
    }
  );
}

/**
 * Create MCP server with tools based on mode
 */
function createMcpServer(modes: ToolMode): McpServer {
  const server = new McpServer({
    name: "sandbox-mcp-server",
    version: "1.0.0"
  });

  if (modes.guiTools) {
    registerGuiTools(server);
  }

  if (modes.cliTools) {
    registerCliTools(server);
  }

  return server;
}

// ============ Express HTTP Server ============

const app = express();
app.use(express.json());

// MCP endpoint - dynamically creates server based on URL parameters
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    // Parse tool modes from query parameters
    const modes = parseToolModes(req.query);
    console.log(`[sandbox-mcp] Request with modes: gui_tools=${modes.guiTools}, cli_tools=${modes.cliTools}`);

    // Create MCP server with appropriate tools
    const server = createMcpServer(modes);

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
    console.error('[sandbox-mcp] Request handling error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'sandbox-mcp-server',
    version: '1.0.0',
    description: 'Isolated Linux sandbox with full desktop GUI capabilities',
    display: process.env.DISPLAY || ':1',
    usage: {
      endpoint: '/mcp',
      parameters: {
        gui_tools: 'on (default) | off - Desktop automation tools (Mouse, Keyboard, Window, Screenshot)',
        cli_tools: 'on | off (default) - Shell, Filesystem, and Code execution tools'
      },
      examples: [
        '/mcp - GUI tools only (default)',
        '/mcp?cli_tools=on - GUI + CLI tools',
        '/mcp?gui_tools=off&cli_tools=on - CLI tools only'
      ]
    },
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '::', () => {
  console.log(`[sandbox-mcp] Server running on http://[::]:${PORT}/mcp`);
  console.log(`[sandbox-mcp] Health check: http://[::]:${PORT}/health`);
  console.log(`[sandbox-mcp] DISPLAY: ${process.env.DISPLAY || ':1'}`);
  console.log(`[sandbox-mcp] Default mode: gui_tools=on, cli_tools=off`);
});
