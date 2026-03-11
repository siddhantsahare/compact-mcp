import type { RuleName, PruningRule } from '../types.js';
import { stripComments } from './stripComments.js';
import { stripConsoleLogs } from './stripConsoleLogs.js';
import { summarizeHooks } from './summarizeHooks.js';
import { summarizeHandlers } from './summarizeHandlers.js';
import { stripPropTypes } from './stripPropTypes.js';
import { collapseStyles } from './collapseStyles.js';
import { stripTypeAnnotations } from './stripTypeAnnotations.js';
import { stripTestAttributes } from './stripTestAttributes.js';

/**
 * All built-in pruning rules in priority order.
 * Each entry is registered on the compressor at construction time.
 */
export const ALL_RULES: [RuleName, PruningRule][] = [
  ['stripComments', stripComments],
  ['stripConsoleLogs', stripConsoleLogs],
  ['summarizeHooks', summarizeHooks],
  ['summarizeHandlers', summarizeHandlers],
  ['stripPropTypes', stripPropTypes],
  ['collapseStyles', collapseStyles],
  ['stripTypeAnnotations', stripTypeAnnotations],
  ['stripTestAttributes', stripTestAttributes],
];

export {
  stripComments,
  stripConsoleLogs,
  summarizeHooks,
  summarizeHandlers,
  stripPropTypes,
  collapseStyles,
  stripTypeAnnotations,
  stripTestAttributes,
};
