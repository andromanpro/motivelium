import build from '../../version.json' with {type:'json'};
import {compareReleaseVersions,parseReleaseVersion} from './releaseVersion.ts';
export const APP_VERSION = build.version;
export const BUILD_ID = build.buildId;
export const READER_FEATURES = build.readerFeatures;
export type ReaderRequirement = {minVersion: string; features: string[]};
export function checkReader(requirement: ReaderRequirement | undefined): void {
  assertReaderCompatible(requirement,APP_VERSION,READER_FEATURES);
}
export function assertReaderCompatible(requirement: ReaderRequirement | undefined,currentVersion:string,readerFeatures:readonly string[]): void {
  if (!requirement) return;
  try {parseReleaseVersion(requirement.minVersion);} catch {throw Error('Некорректные требования к версии Motivelium.');}
  if (!Array.isArray(requirement.features) || requirement.features.length>20 || requirement.features.some(f => typeof f !== 'string'||f.length>64)) throw Error('Некорректные требования к версии Motivelium.');
  const missing = requirement.features.filter(f => !readerFeatures.includes(f));
  if (compareReleaseVersions(requirement.minVersion,currentVersion)>0 || missing.length) throw Error(`Обновите Motivelium: проект требует ${requirement.minVersion}${missing.length ? ' · ' + missing.join(', ') : ''}. Сейчас ${currentVersion}.`);
}
