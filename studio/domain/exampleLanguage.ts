/** Content language is chosen when opening/creating an example, independently of the UI. */
export type ExampleLanguage = 'ru' | 'en';
export function exampleLanguage(value:unknown):ExampleLanguage|null {
 return value===undefined||value===null?'ru':value==='ru'||value==='en'?value:null;
}
