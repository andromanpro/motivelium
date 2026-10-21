/** Installed builds keep user data outside replaceable application files. */
import path from 'node:path';
export function localDataDir(root:string, env:NodeJS.ProcessEnv=process.env):string {
 const value=env.MOTIVELIUM_DATA_DIR;
 if(value!==undefined){if(!value.trim()||!path.isAbsolute(value))throw Error('MOTIVELIUM_DATA_DIR должен содержать абсолютный путь к данным.');return path.resolve(value);}
 return path.resolve(root,'.local');
}
