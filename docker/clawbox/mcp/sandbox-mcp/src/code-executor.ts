/**
 * Code Executor for EdgeBox MCP Server
 * 
 * Provides code execution capabilities for multiple languages:
 * - Python 3
 * - Bash
 * - TypeScript/JavaScript (via Node.js)
 * - Java
 * - R
 * 
 * Each execution is sandboxed in a temporary directory with timeout protection.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  language: string;
}

export interface ExecutionOptions {
  timeout?: number;  // milliseconds
  workdir?: string;
  env?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Code Executor class
 * Handles execution of code in various languages
 */
export class CodeExecutor {
  private tempDir: string;

  constructor() {
    this.tempDir = os.tmpdir();
  }

  /**
   * Create a temporary file with the given content
   */
  private async createTempFile(prefix: string, extension: string, content: string): Promise<string> {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const filename = `${prefix}_${timestamp}_${random}${extension}`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    return filepath;
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute a command with timeout
   */
  private async executeWithTimeout(
    command: string,
    args: string[],
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult & { files?: string[] }> {
    const { timeout = DEFAULT_TIMEOUT, workdir, env } = options;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: workdir || '/home/core',
        env: { ...process.env, ...env },
        timeout
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (killed) {
          stderr += `\nExecution timed out after ${timeout}ms`;
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? (killed ? 124 : 1),
          duration,
          language: ''
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
          duration,
          language: ''
        });
      });
    });
  }

  /**
   * Execute Python code
   */
  async executePython(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const filepath = await this.createTempFile('python', '.py', code);
    
    try {
      const result = await this.executeWithTimeout('python3', [filepath], options);
      return { ...result, language: 'python' };
    } finally {
      await this.cleanup([filepath]);
    }
  }

  /**
   * Execute Bash script
   */
  async executeBash(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const filepath = await this.createTempFile('bash', '.sh', code);
    
    try {
      const result = await this.executeWithTimeout('bash', [filepath], options);
      return { ...result, language: 'bash' };
    } finally {
      await this.cleanup([filepath]);
    }
  }

  /**
   * Execute TypeScript/JavaScript code using Node.js
   * For TypeScript, we use ts-node if available, otherwise transpile first
   */
  async executeTypeScript(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    // First check if the code looks like TypeScript (has type annotations)
    const isTypeScript = /:\s*(string|number|boolean|any|void|never|object|Array|Promise|Record)\b/.test(code) ||
                         /interface\s+\w+/.test(code) ||
                         /type\s+\w+\s*=/.test(code) ||
                         /<[^>]+>/.test(code);

    if (isTypeScript) {
      // Try using ts-node first
      const filepath = await this.createTempFile('typescript', '.ts', code);
      try {
        // Check if ts-node is available
        try {
          await execAsync('which ts-node');
          const result = await this.executeWithTimeout('ts-node', [filepath], options);
          return { ...result, language: 'typescript' };
        } catch {
          // ts-node not available, try npx
          const result = await this.executeWithTimeout('npx', ['ts-node', filepath], {
            ...options,
            timeout: (options.timeout || DEFAULT_TIMEOUT) + 10000 // Extra time for npx
          });
          return { ...result, language: 'typescript' };
        }
      } finally {
        await this.cleanup([filepath]);
      }
    } else {
      // Plain JavaScript, use node directly
      const filepath = await this.createTempFile('javascript', '.js', code);
      try {
        const result = await this.executeWithTimeout('node', [filepath], options);
        return { ...result, language: 'javascript' };
      } finally {
        await this.cleanup([filepath]);
      }
    }
  }

  /**
   * Execute Java code
   * Automatically wraps code in a class if not already wrapped
   */
  async executeJava(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    // Check if code already has a class definition
    const hasClass = /public\s+class\s+\w+/.test(code);
    
    let finalCode = code;
    let className = 'Main';
    
    if (!hasClass) {
      // Wrap in a Main class with main method
      if (!code.includes('public static void main')) {
        finalCode = `
public class Main {
    public static void main(String[] args) {
        ${code}
    }
}`;
      } else {
        finalCode = `
public class Main {
    ${code}
}`;
      }
    } else {
      // Extract class name
      const match = code.match(/public\s+class\s+(\w+)/);
      if (match) {
        className = match[1];
      }
    }

    const javaDir = path.join(this.tempDir, `java_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(javaDir, { recursive: true });
    
    const javaFile = path.join(javaDir, `${className}.java`);
    await fs.writeFile(javaFile, finalCode, 'utf-8');
    
    try {
      // Compile
      const compileResult = await this.executeWithTimeout('javac', [javaFile], {
        ...options,
        workdir: javaDir
      });
      
      if (compileResult.exitCode !== 0) {
        return { ...compileResult, language: 'java', stderr: `Compilation error:\n${compileResult.stderr}` };
      }
      
      // Run
      const runResult = await this.executeWithTimeout('java', ['-cp', javaDir, className], options);
      return { ...runResult, language: 'java' };
    } finally {
      // Cleanup directory
      try {
        const files = await fs.readdir(javaDir);
        for (const file of files) {
          await fs.unlink(path.join(javaDir, file));
        }
        await fs.rmdir(javaDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute R code
   */
  async executeR(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const filepath = await this.createTempFile('rscript', '.R', code);
    
    try {
      const result = await this.executeWithTimeout('Rscript', [filepath], options);
      return { ...result, language: 'r' };
    } finally {
      await this.cleanup([filepath]);
    }
  }

  /**
   * Check which languages are available
   */
  async checkAvailableLanguages(): Promise<Record<string, boolean>> {
    const languages: Record<string, boolean> = {};
    
    const checks = [
      { name: 'python', cmd: 'python3 --version' },
      { name: 'bash', cmd: 'bash --version' },
      { name: 'node', cmd: 'node --version' },
      { name: 'typescript', cmd: 'npx ts-node --version' },
      { name: 'java', cmd: 'java -version' },
      { name: 'r', cmd: 'Rscript --version' }
    ];
    
    for (const { name, cmd } of checks) {
      try {
        await execAsync(cmd, { timeout: 10000 });
        languages[name] = true;
      } catch {
        languages[name] = false;
      }
    }
    
    return languages;
  }
}
