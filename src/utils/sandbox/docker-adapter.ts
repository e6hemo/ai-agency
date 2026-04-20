import { spawn } from 'child_process';
import path from 'path';

export interface DockerSandboxOptions {
  image?: string;
  cwd?: string;
  timeoutMs?: number;
  mounts?: { hostPath: string, containerPath: string, readonly?: boolean }[];
}

export async function wrapWithDocker(command: string, options: DockerSandboxOptions = {}): Promise<string> {
  const image = options.image || 'node:18-alpine';
  const cwd = options.cwd || process.cwd();
  const mounts = options.mounts || [{ hostPath: cwd, containerPath: '/workspace', readonly: false }];
  
  const dockerArgs = ['run', '--rm', '--network', 'none'];
  
  // Apply mounts
  for (const m of mounts) {
    const bindOpt = m.readonly ? 'ro' : 'rw';
    dockerArgs.push('-v', `${path.resolve(m.hostPath)}:${m.containerPath}:${bindOpt}`);
  }

  // Set working directory
  dockerArgs.push('-w', '/workspace');

  // Enforce memory & CPU limits to prevent agent from DoS-ing the host
  dockerArgs.push('--memory', '1g', '--cpus', '1');

  dockerArgs.push(image);
  dockerArgs.push('sh', '-c', command);

  return dockerArgs.join(' ');
}
