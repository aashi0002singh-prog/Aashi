import {createDefaultData,RECORD_ORDER,CATEGORIES,CATEGORY_COLORS} from './data/models.js';
const d=createDefaultData().A576.items;
console.log(JSON.stringify({order:RECORD_ORDER,items:d,categories:CATEGORIES,colors:CATEGORY_COLORS}));
