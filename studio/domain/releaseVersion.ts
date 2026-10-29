// The package reader and release tooling share the same ordered release channels.
export type ReleaseVersion = {major:number; minor:number; patch:number; channel:'alpha'|'beta'|'rc'|'stable'; iteration:number};
const releasePattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;
const channelOrder = {alpha:0, beta:1, rc:2, stable:3} as const;

export function parseReleaseVersion(value:string):ReleaseVersion {
  const match = typeof value === 'string' && value.length <= 40 ? releasePattern.exec(value) : null;
  if (!match || match[0]!==value) throw Error('Invalid Motivelium release version: ' + value);
  const parts = [Number(match[1]),Number(match[2]),Number(match[3]),Number(match[5] ?? 0)];
  if (parts.some(n => !Number.isSafeInteger(n))) throw Error('Invalid Motivelium release version: ' + value);
  return {major:parts[0]!,minor:parts[1]!,patch:parts[2]!,channel:(match[4] ?? 'stable') as ReleaseVersion['channel'],iteration:parts[3]!};
}

export function compareReleaseVersions(left:string,right:string):number {
  const a=parseReleaseVersion(left),b=parseReleaseVersion(right);
  for (const key of ['major','minor','patch'] as const) if(a[key]!==b[key]) return Math.sign(a[key]-b[key]);
  if(a.channel!==b.channel) return Math.sign(channelOrder[a.channel]-channelOrder[b.channel]);
  return Math.sign(a.iteration-b.iteration);
}

// Preserve alpha.N -> a.b.c.N, while beta/rc/stable sort after it in Windows.
export function windowsReleaseVersion(value:string):string {
  const v=parseReleaseVersion(value);
  if([v.major,v.minor,v.patch].some(n=>n>65535)||v.iteration>9999) throw Error('Release exceeds Windows version limits: '+value);
  const revision=v.channel==='stable'?65535:channelOrder[v.channel]*10000+v.iteration;
  return [v.major,v.minor,v.patch,revision].join('.');
}
