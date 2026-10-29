import {ProjectSetupError,projectSetup} from '../../domain/projectSetup.ts';
import {ui} from './i18n.ts';
export function validatedSetup(input:Record<string,unknown>){
 try{return projectSetup(input)}catch(error){
  if(!(error instanceof ProjectSetupError))throw error;
  const messages={title:ui('Название должно содержать от 1 до 200 символов.'),size:ui('Размер кадра — от 16 до 4096 пикселей по стороне, до 8,8 Мп.'),fps:ui('Частота кадров должна быть от 1 до 120.'),duration:ui('Длительность — до 5 минут и 36 000 кадров.')};
  throw Object.assign(new Error(messages[error.code]),{code:error.code,cause:error});
 }
}
