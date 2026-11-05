import{videoUi}from'./video.ts';
import{en03}from'./en03.ts';
import{sourceCatalog as core,sourceGroups as coreGroups}from'./en01.ts';
import{en02}from'./en02.ts';
export const sourceCatalog={...core,...en02,...en03,...videoUi} as const;
export const sourceGroups=[...coreGroups,en02,en03,videoUi];
export type SourceMessage=keyof typeof sourceCatalog;
