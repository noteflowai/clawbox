/**
 * Desktop Controller for EdgeBox MCP Server
 * 
 * Provides mouse, keyboard, window, and screenshot operations
 * using xdotool and scrot on local XFCE desktop (DISPLAY=:1)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { WindowInfo, MouseButton, ScrollDirection, TypeOptions } from './types.js';

const execAsync = promisify(exec);

// Webtop uses DISPLAY=:1
const DISPLAY = ':1';

export class DesktopController {
  private env: NodeJS.ProcessEnv;

  constructor() {
    this.env = { ...process.env, DISPLAY };
  }

  /**
   * Execute a shell command with DISPLAY environment
   */
  private async exec(command: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(command, { 
        env: this.env,
        timeout: timeoutMs 
      });
      return result;
    } catch (error: any) {
      // exec throws on non-zero exit, but we still get stdout/stderr
      if (error.stdout !== undefined || error.stderr !== undefined) {
        return { stdout: error.stdout || '', stderr: error.stderr || '' };
      }
      throw error;
    }
  }

  // ============ Mouse Operations ============

  /**
   * Perform mouse click at current position or specified coordinates
   */
  async mouseClick(button: MouseButton = 'left', x?: number, y?: number): Promise<void> {
    const buttonMap: Record<MouseButton, number> = { left: 1, right: 3, middle: 2 };
    
    if (x !== undefined && y !== undefined) {
      await this.exec(`xdotool mousemove --sync ${x} ${y}`);
    }
    await this.exec(`xdotool click ${buttonMap[button]}`);
  }

  /**
   * Perform mouse double click
   */
  async mouseDoubleClick(x?: number, y?: number): Promise<void> {
    if (x !== undefined && y !== undefined) {
      await this.exec(`xdotool mousemove --sync ${x} ${y}`);
    }
    await this.exec('xdotool click --repeat 2 1');
  }

  /**
   * Move mouse to specified coordinates
   */
  async mouseMove(x: number, y: number): Promise<void> {
    await this.exec(`xdotool mousemove --sync ${x} ${y}`);
  }

  /**
   * Perform mouse scroll
   */
  async mouseScroll(direction: ScrollDirection, amount = 1): Promise<void> {
    const button = direction === 'up' ? 4 : 5;
    await this.exec(`xdotool click --repeat ${amount} ${button}`);
  }

  /**
   * Perform mouse drag from one position to another
   */
  async mouseDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    await this.exec(`xdotool mousemove --sync ${fromX} ${fromY}`);
    await this.exec('xdotool mousedown 1');
    await this.exec(`xdotool mousemove --sync ${toX} ${toY}`);
    await this.exec('xdotool mouseup 1');
  }

  // ============ Keyboard Operations ============

  /**
   * Type text using keyboard input
   * Automatically uses clipboard for non-ASCII characters
   */
  async keyboardType(text: string, options: TypeOptions = {}): Promise<void> {
    const { delay = 12, useClipboard = false } = options;

    // Limit delay to max 25ms
    const actualDelay = Math.min(Math.max(delay, 1), 25);

    // Check for non-ASCII characters
    const hasNonAscii = /[^\x00-\x7F]/.test(text);
    const shouldUseClipboard = hasNonAscii || useClipboard;

    if (shouldUseClipboard) {
      // Use clipboard method for non-ASCII or when forced
      console.log(`[desktop] Using clipboard method for text: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      
      // Escape special characters for shell
      const escapedText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      
      try {
        await this.exec(`echo -n "${escapedText}" | xclip -selection clipboard`, 3000);
      } catch (error) {
        console.error('[desktop] Clipboard operation failed:', error);
      }
      
      // Paste with Ctrl+V
      await this.keyboardCombo(['ctrl', 'v']);
    } else {
      // Use xdotool type for ASCII text
      console.log(`[desktop] Using xdotool type for text: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      
      // Escape special characters for xdotool
      const escapedText = text.replace(/"/g, '\\"');
      await this.exec(`xdotool type --delay ${actualDelay} "${escapedText}"`);
    }
  }

  /**
   * Press a specific key
   */
  async keyboardPress(key: string): Promise<void> {
    await this.exec(`xdotool key ${key}`);
  }

  /**
   * Press key combination/shortcut
   */
  async keyboardCombo(keys: string[]): Promise<void> {
    const combo = keys.join('+');
    await this.exec(`xdotool key ${combo}`);
  }

  // ============ Window Operations ============

  /**
   * Get list of all windows with their class names and titles
   */
  async getAllWindows(includeMinimized = false): Promise<WindowInfo[]> {
    try {
      const searchCmd = includeMinimized 
        ? 'xdotool search ""' 
        : 'xdotool search --onlyvisible ""';
      
      const { stdout } = await this.exec(searchCmd);
      const windowIds = stdout.trim().split('\n').filter(id => id);

      const windows: WindowInfo[] = [];
      
      for (const windowId of windowIds) {
        try {
          const { stdout: className } = await this.exec(`xdotool getwindowclassname ${windowId}`);
          const { stdout: title } = await this.exec(`xdotool getwindowname ${windowId}`);

          let isMinimized = false;
          if (includeMinimized) {
            try {
              const { stdout: wmState } = await this.exec(`xprop -id ${windowId} _NET_WM_STATE 2>/dev/null || echo "UNKNOWN"`);
              isMinimized = wmState.includes('_NET_WM_STATE_HIDDEN');
            } catch {
              isMinimized = true;
            }
          }

          windows.push({
            windowId,
            appClass: className.trim(),
            title: title.trim(),
            isMinimized
          });
        } catch {
          // Skip windows we can't get info for
          continue;
        }
      }

      return windows;
    } catch (error) {
      console.error('[desktop] Failed to get windows:', error);
      return [];
    }
  }

  /**
   * Switch to and focus a specific window
   */
  async switchToWindow(windowId: string): Promise<boolean> {
    try {
      await this.exec(`xdotool windowactivate ${windowId}`);
      await this.exec(`xdotool windowfocus ${windowId}`);
      return true;
    } catch (error) {
      console.error(`[desktop] Failed to switch to window ${windowId}:`, error);
      return false;
    }
  }

  /**
   * Maximize a window
   */
  async maximizeWindow(windowId: string): Promise<boolean> {
    try {
      await this.exec(`xdotool windowsize ${windowId} 100% 100%`);
      return true;
    } catch (error) {
      console.error(`[desktop] Failed to maximize window ${windowId}:`, error);
      return false;
    }
  }

  /**
   * Minimize a window
   */
  async minimizeWindow(windowId: string): Promise<boolean> {
    try {
      await this.exec(`xdotool windowminimize ${windowId}`);
      return true;
    } catch (error) {
      console.error(`[desktop] Failed to minimize window ${windowId}:`, error);
      return false;
    }
  }

  /**
   * Resize a window to given dimensions
   */
  async resizeWindow(windowId: string, width: number, height: number): Promise<boolean> {
    try {
      await this.exec(`xdotool windowsize ${windowId} ${width} ${height}`);
      return true;
    } catch (error) {
      console.error(`[desktop] Failed to resize window ${windowId}:`, error);
      return false;
    }
  }

  // ============ Screenshot and Application Operations ============

  /**
   * Take a screenshot of the desktop
   * Returns base64 encoded PNG data
   */
  async takeScreenshot(): Promise<Buffer> {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/screenshot-${timestamp}.png`;

    try {
      // Use scrot to capture screenshot (with mouse pointer)
      await this.exec(`scrot --pointer ${screenshotPath}`);

      // Read file content
      const imageData = await fs.readFile(screenshotPath);

      // Cleanup temp file
      await fs.unlink(screenshotPath).catch(() => {});

      return imageData;
    } catch (error) {
      // Cleanup on error
      await fs.unlink(screenshotPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Launch an application by name
   */
  async launchApplication(appName: string): Promise<void> {
    // Use nohup to detach process and prevent it from blocking
    await this.exec(`nohup gtk-launch ${appName} > /dev/null 2>&1 &`);
  }

  /**
   * Wait for specified number of seconds
   */
  async wait(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  // ============ Shell Operations ============

  /**
   * Run a shell command and return result
   */
  async shellRun(command: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        env: this.env,
        timeout: timeoutMs,
        cwd: '/home/core'
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Run a shell command in background
   */
  async shellRunBackground(command: string, waitMs = 2000): Promise<{ pid: number; stdout: string; stderr: string; status: string }> {
    try {
      // Start command in background with nohup
      const bgCommand = `nohup bash -c '${command.replace(/'/g, "'\\''")}' > /tmp/bg_stdout_$$.log 2> /tmp/bg_stderr_$$.log & echo $!`;
      const { stdout: pidStr } = await execAsync(bgCommand, {
        env: this.env,
        cwd: '/home/core'
      });
      
      const pid = parseInt(pidStr.trim(), 10);
      
      // Wait a bit for initial output
      await new Promise(resolve => setTimeout(resolve, waitMs));
      
      // Try to read any output
      let stdout = '';
      let stderr = '';
      try {
        const { stdout: out } = await execAsync(`cat /tmp/bg_stdout_${pid}.log 2>/dev/null || true`, { env: this.env });
        stdout = out;
      } catch {}
      try {
        const { stdout: err } = await execAsync(`cat /tmp/bg_stderr_${pid}.log 2>/dev/null || true`, { env: this.env });
        stderr = err;
      } catch {}
      
      return { pid, stdout, stderr, status: 'running' };
    } catch (error: any) {
      return {
        pid: 0,
        stdout: '',
        stderr: error.message || 'Failed to start background process',
        status: 'failed'
      };
    }
  }

  // ============ Filesystem Operations ============

  /**
   * List files in a directory
   */
  async fsList(path: string): Promise<Array<{ name: string; type: string; size: number; modified: string }>> {
    try {
      const { stdout } = await execAsync(
        `ls -la --time-style=long-iso "${path}" | tail -n +2`,
        { env: this.env }
      );
      
      const files: Array<{ name: string; type: string; size: number; modified: string }> = [];
      const lines = stdout.trim().split('\n').filter(line => line);
      
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 8) {
          const perms = parts[0];
          const size = parseInt(parts[4], 10);
          const date = parts[5];
          const time = parts[6];
          const name = parts.slice(7).join(' ');
          
          if (name === '.' || name === '..') continue;
          
          let type = 'file';
          if (perms.startsWith('d')) type = 'directory';
          else if (perms.startsWith('l')) type = 'symlink';
          
          files.push({
            name,
            type,
            size,
            modified: `${date} ${time}`
          });
        }
      }
      
      return files;
    } catch (error: any) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  /**
   * Read file contents
   */
  async fsRead(path: string): Promise<string> {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return content;
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write content to a file
   */
  async fsWrite(path: string, content: string): Promise<void> {
    try {
      await fs.writeFile(path, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Get file information
   */
  async fsInfo(path: string): Promise<{
    name: string;
    type: string;
    size: number;
    created: string;
    modified: string;
    permissions: string;
  }> {
    try {
      const stats = await fs.stat(path);
      const { stdout: perms } = await execAsync(`stat -c '%a' "${path}"`, { env: this.env });
      
      let type = 'file';
      if (stats.isDirectory()) type = 'directory';
      else if (stats.isSymbolicLink()) type = 'symlink';
      else if (stats.isBlockDevice()) type = 'block';
      else if (stats.isCharacterDevice()) type = 'character';
      else if (stats.isFIFO()) type = 'fifo';
      else if (stats.isSocket()) type = 'socket';
      
      return {
        name: path.split('/').pop() || path,
        type,
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        permissions: perms.trim()
      };
    } catch (error: any) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Watch a directory for changes
   */
  async fsWatch(path: string, timeoutMs = 5000): Promise<Array<{ event: string; filename: string; timestamp: string }>> {
    const events: Array<{ event: string; filename: string; timestamp: string }> = [];
    const { watch } = await import('fs');
    
    return new Promise((resolve) => {
      const watcher = watch(path, (eventType: string, filename: string | null) => {
        events.push({
          event: eventType,
          filename: filename || 'unknown',
          timestamp: new Date().toISOString()
        });
      });
      
      // Cleanup watcher after timeout
      setTimeout(() => {
        watcher.close();
        resolve(events);
      }, timeoutMs);
    });
  }
}
