/**
 * Type definitions for EdgeBox MCP Server
 */

export interface WindowInfo {
  windowId: string;
  appClass: string;
  title: string;
  isMinimized?: boolean;
}

export interface ScreenshotResult {
  format: 'png';
  data: string;  // base64 encoded
  size: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface FileInfo {
  name: string;
  type: string;
  size: number;
  created: string;
  modified: string;
  permissions: string;
}

export interface FileEntry {
  name: string;
  type: string;
  size: number;
  modified: string;
}

export interface WatchEvent {
  event: string;
  filename: string;
  timestamp: string;
}

export type MouseButton = 'left' | 'right' | 'middle';
export type ScrollDirection = 'up' | 'down';

export interface TypeOptions {
  delay?: number;        // Typing delay in ms (1-25, default: 12)
  useClipboard?: boolean; // Force clipboard method
}
