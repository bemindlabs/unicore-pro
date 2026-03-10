import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { networkInterfaces, cpus, platform } from 'node:os';
import type { MachineFingerprint } from './types';

function execSafe(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function getCpuId(): string {
  const os = platform();
  if (os === 'linux') {
    return execSafe('cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2') || cpus()[0]?.model || 'unknown';
  }
  if (os === 'darwin') {
    return execSafe('sysctl -n machdep.cpu.brand_string') || cpus()[0]?.model || 'unknown';
  }
  if (os === 'win32') {
    return execSafe('wmic cpu get ProcessorId /value') || cpus()[0]?.model || 'unknown';
  }
  return cpus()[0]?.model || 'unknown';
}

function getMacAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const entry of iface) {
      if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        return entry.mac;
      }
    }
  }
  return 'unknown';
}

function getDiskId(): string {
  const os = platform();
  if (os === 'linux') {
    return execSafe('cat /etc/machine-id') || execSafe('blkid -s UUID -o value | head -1') || 'unknown';
  }
  if (os === 'darwin') {
    return execSafe("ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformSerialNumber | awk '{print $4}' | tr -d '\"'") || 'unknown';
  }
  if (os === 'win32') {
    return execSafe('wmic diskdrive get SerialNumber /value') || 'unknown';
  }
  return 'unknown';
}

export function collectFingerprint(): MachineFingerprint {
  const cpuId = getCpuId();
  const macAddress = getMacAddress();
  const diskId = getDiskId();

  const hash = createHash('sha256')
    .update(`${cpuId}|${macAddress}|${diskId}`)
    .digest('hex');

  return { cpuId, macAddress, diskId, hash };
}
