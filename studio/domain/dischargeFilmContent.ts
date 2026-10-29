import type{ExampleLanguage}from'./exampleLanguage.ts';

/** Copy belongs to this recipe; keys are stable identities, never source-language labels. */
export const DISCHARGE_COPY={
 ru:{title:'Один удар · полный этюд',sequence:'Деталь → ожидание → удар → след',titleLayer:'Название после события',headline:'Один удар',background:'Тёмная студия',device:'Керамический разрядник',
 cues:{detail:'Близко: металл и керамика',reveal:'Раскрытие пространства',charge:'Тишина перед ударом',strike:'Главный удар',echo:'Повтор',trace:'Остывание',title:'Один удар'}},
 en:{title:'One Strike · a study in light',sequence:'Detail → anticipation → strike → afterglow',titleLayer:'Title after the event',headline:'One Strike',background:'Dark studio',device:'Ceramic spark gap',
 cues:{detail:'Up close: metal and ceramic',reveal:'Reveal the space',charge:'The quiet before the strike',strike:'Main strike',echo:'Echo',trace:'Afterglow',title:'One Strike'}},
} as const satisfies Record<ExampleLanguage,unknown>;
export const DISCHARGE_ASSET_NAMES={
 'asset-discharge-device':'Ceramic spark gap · Motivelium · MIT',
 'asset-strike-bed':'One Strike · original score',
 'asset-strike-crack':'One Strike · electric crack',
 'asset-strike-tick':'One Strike · pre-strike tick',
} as const;
export const DISCHARGE_TRACK_NAMES={
 'sound-bed':'Original score','main-crack':'Main electric crack','echo-crack':'Echo',
 'foley-first':'First pre-strike tick','foley-second':'Second pre-strike tick',
} as const;
