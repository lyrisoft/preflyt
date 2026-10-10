import { isAiNotification } from './ai-notification.js';
import { isGovernanceNotification } from './notification-event.js';

/** Mandatory inbox alerts still require current recipients/scope; email is always opt-in. */
export const isMandatoryNotification = (type: string) =>
  isGovernanceNotification(type) || isAiNotification(type) ||
  ['CRITICAL_FINDINGS_REPORTED', 'NATIVE_EXECUTION_FAILED'].includes(type);
