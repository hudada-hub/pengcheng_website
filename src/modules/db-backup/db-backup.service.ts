import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rm, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { pipeline } from 'stream/promises';

export type DbBackupFile = {
  fileName: string;
  fullPath: string;
  size: number;
  createdAt: Date;
};

type BackupMode = 'auto' | 'cli' | 'docker';

const SAFE_SQL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.sql$/;

function safeSqlFileName(input: string): string {
  const base = basename(input || '');
  if (!SAFE_SQL_NAME.test(base)) {
    throw new Error('非法备份文件名');
  }
  return base;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatTs(d: Date) {
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    '-' +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

@Injectable()
export class DbBackupService {
  private readonly logger = new Logger(DbBackupService.name);

  constructor(private readonly config: ConfigService) {}

  private getBackupDir(): string {
    const dir = this.config.get<string>('backup.dir') || 'storage/db-backups';
    return resolve(process.cwd(), dir);
  }

  private getKeepDays(): number {
    const n = this.config.get<number>('backup.keepDays');
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1)
      return Math.floor(n);
    return 30;
  }

  private getMode(): BackupMode {
    const raw = (
      this.config.get<string>('backup.mode') || 'auto'
    ).toLowerCase();
    if (raw === 'cli' || raw === 'docker' || raw === 'auto') return raw;
    return 'auto';
  }

  private getDockerContainer(): string {
    return this.config.get<string>('backup.dockerContainer') || 'mysql';
  }

  private getDbConfig() {
    const host =
      this.config.get<string>('database.host') ||
      process.env.DB_HOST ||
      '47.116.106.247';
    const port =
      this.config.get<number>('database.port') ??
      parseInt(process.env.DB_PORT || '3306', 10);
    const username =
      this.config.get<string>('database.username') ||
      process.env.DB_USERNAME ||
      'pengcheng';
    const password =
      this.config.get<string>('database.password') ||
      process.env.DB_PASSWORD ||
      'pengcheng';
    const database =
      this.config.get<string>('database.database') ||
      process.env.DB_DATABASE ||
      'pengcheng';
    return { host, port, username, password, database };
  }

  async listBackups(): Promise<DbBackupFile[]> {
    const dir = this.getBackupDir();
    await mkdir(dir, { recursive: true });
    const names = await readdir(dir);
    const sqlFiles = names.filter((n) => SAFE_SQL_NAME.test(n));
    const items = await Promise.all(
      sqlFiles.map(async (fileName) => {
        const fullPath = join(dir, fileName);
        const s = await stat(fullPath);
        return {
          fileName,
          fullPath,
          size: s.size,
          createdAt: s.birthtime ?? s.mtime,
        } satisfies DbBackupFile;
      }),
    );
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return items;
  }

  async deleteBackup(fileName: string): Promise<void> {
    const safe = safeSqlFileName(fileName);
    const fullPath = join(this.getBackupDir(), safe);
    await rm(fullPath, { force: true });
  }

  async getBackupStream(fileName: string) {
    const safe = safeSqlFileName(fileName);
    const fullPath = join(this.getBackupDir(), safe);
    return createReadStream(fullPath);
  }

  private async tryRun(
    cmd: string,
    args: string[],
    opts: {
      env?: Record<string, string | undefined>;
      stdinFromFile?: string;
      stdoutToFile?: string;
    },
  ): Promise<void> {
    await mkdir(this.getBackupDir(), { recursive: true });
    const env = { ...process.env, ...(opts.env ?? {}) } as Record<
      string,
      string
    >;
    const child = spawn(cmd, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += String(d)));

    const tasks: Promise<unknown>[] = [];
    if (opts.stdoutToFile) {
      tasks.push(pipeline(child.stdout, createWriteStream(opts.stdoutToFile)));
    }
    if (opts.stdinFromFile) {
      tasks.push(pipeline(createReadStream(opts.stdinFromFile), child.stdin));
    } else {
      child.stdin.end();
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 0));
    });
    await Promise.all(tasks);

    if (exitCode !== 0) {
      const msg = stderr.trim() || `${cmd} 执行失败，退出码 ${exitCode}`;
      throw new Error(msg);
    }
  }

  private async commandWorks(cmd: string, args: string[]): Promise<boolean> {
    try {
      await this.tryRun(cmd, args, {
        env: {},
        stdoutToFile: undefined,
        stdinFromFile: undefined,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async dumpViaCli(outFile: string): Promise<void> {
    const { host, port, username, password, database } = this.getDbConfig();
    await this.tryRun(
      'mysqldump',
      [
        `--host=${host}`,
        `--port=${port}`,
        `--user=${username}`,
        '--databases',
        database,
        '--single-transaction',
        '--routines',
        '--events',
        '--triggers',
        '--default-character-set=utf8mb4',
      ],
      { env: { MYSQL_PWD: password }, stdoutToFile: outFile },
    );
  }

  private async restoreViaCli(sqlFile: string): Promise<void> {
    const { host, port, username, password, database } = this.getDbConfig();
    await this.tryRun(
      'mysql',
      [`--host=${host}`, `--port=${port}`, `--user=${username}`, database],
      { env: { MYSQL_PWD: password }, stdinFromFile: sqlFile },
    );
  }

  private async dumpViaDocker(outFile: string): Promise<void> {
    const { username, password, database } = this.getDbConfig();
    const container = this.getDockerContainer();
    await this.tryRun(
      'docker',
      [
        'exec',
        '-e',
        `MYSQL_PWD=${password}`,
        container,
        'mysqldump',
        `--user=${username}`,
        '--databases',
        database,
        '--single-transaction',
        '--routines',
        '--events',
        '--triggers',
        '--default-character-set=utf8mb4',
      ],
      { stdoutToFile: outFile },
    );
  }

  private async restoreViaDocker(sqlFile: string): Promise<void> {
    const { username, password, database } = this.getDbConfig();
    const container = this.getDockerContainer();
    await this.tryRun(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        `MYSQL_PWD=${password}`,
        container,
        'mysql',
        `--user=${username}`,
        database,
      ],
      { stdinFromFile: sqlFile },
    );
  }

  private async pruneOldBackups(): Promise<void> {
    const keepDays = this.getKeepDays();
    const dir = this.getBackupDir();
    const files = await this.listBackups();
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const toDelete = files.filter((f) => f.createdAt.getTime() < cutoff);
    if (!toDelete.length) return;
    await Promise.all(
      toDelete.map(async (f) => {
        try {
          await rm(join(dir, f.fileName), { force: true });
        } catch {}
      }),
    );
  }

  async createBackup(
    reason: 'manual' | 'schedule' = 'manual',
  ): Promise<DbBackupFile> {
    const dir = this.getBackupDir();
    await mkdir(dir, { recursive: true });

    const now = new Date();
    const fileName = `pengcheng-${formatTs(now)}-${reason}.sql`;
    const fullPath = join(dir, fileName);

    const mode = this.getMode();
    const startedAt = Date.now();
    this.logger.log(`开始数据库备份（mode=${mode}） -> ${fileName}`);

    const cliOk =
      mode === 'cli' ||
      (mode === 'auto' &&
        (await this.commandWorks('mysqldump', ['--version'])));
    const dockerOk =
      mode === 'docker' ||
      (mode === 'auto' && (await this.commandWorks('docker', ['--version'])));

    let used: BackupMode | null = null;
    let lastErr: unknown = null;
    if (cliOk && (mode === 'cli' || mode === 'auto')) {
      try {
        await this.dumpViaCli(fullPath);
        used = 'cli';
      } catch (e) {
        lastErr = e;
      }
    }
    if (!used && dockerOk && (mode === 'docker' || mode === 'auto')) {
      try {
        await this.dumpViaDocker(fullPath);
        used = 'docker';
      } catch (e) {
        lastErr = e;
      }
    }
    if (!used) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('备份失败：未找到可用的 mysqldump 或 docker 环境');
    }

    const s = await stat(fullPath);
    await this.pruneOldBackups();
    this.logger.log(
      `数据库备份完成（used=${used}，size=${s.size}，耗时=${Date.now() - startedAt}ms） -> ${fileName}`,
    );
    return {
      fileName,
      fullPath,
      size: s.size,
      createdAt: s.birthtime ?? s.mtime,
    };
  }

  async restoreBackup(fileName: string): Promise<void> {
    const safe = safeSqlFileName(fileName);
    const dir = this.getBackupDir();
    const fullPath = join(dir, safe);

    const mode = this.getMode();
    this.logger.warn(`开始数据库恢复（mode=${mode}） <- ${safe}`);

    const cliOk =
      mode === 'cli' ||
      (mode === 'auto' && (await this.commandWorks('mysql', ['--version'])));
    const dockerOk =
      mode === 'docker' ||
      (mode === 'auto' && (await this.commandWorks('docker', ['--version'])));

    let used: BackupMode | null = null;
    let lastErr: unknown = null;
    if (cliOk && (mode === 'cli' || mode === 'auto')) {
      try {
        await this.restoreViaCli(fullPath);
        used = 'cli';
      } catch (e) {
        lastErr = e;
      }
    }
    if (!used && dockerOk && (mode === 'docker' || mode === 'auto')) {
      try {
        await this.restoreViaDocker(fullPath);
        used = 'docker';
      } catch (e) {
        lastErr = e;
      }
    }
    if (!used) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('恢复失败：未找到可用的 mysql 或 docker 环境');
    }

    this.logger.warn(`数据库恢复完成（used=${used}） <- ${safe}`);
  }
}
