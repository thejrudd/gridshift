import { ROOKIES_2026 } from '../src/data/rookies.js';
import { auditCombineInvitees } from '../src/data/rookieCombine.js';

const audit = auditCombineInvitees(ROOKIES_2026);

console.log(JSON.stringify(audit, null, 2));
