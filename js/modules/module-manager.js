export const MODULES = Object.freeze({excelComparison:true,labKnowledge:true,parameter360:true,fileCommandCenter:true});
export function isModuleEnabled(name){return MODULES[name]===true}
export function applyModuleVisibility(){document.querySelectorAll('[data-module]').forEach(el=>el.hidden=!isModuleEnabled(el.dataset.module))}
