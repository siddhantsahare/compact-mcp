import type { RuleName, PruningRule } from '../types.js';
import { stripComments } from './stripComments.js';
import { stripConsoleLogs } from './stripConsoleLogs.js';
import { summarizeHooks } from './summarizeHooks.js';
import { summarizeHandlers } from './summarizeHandlers.js';
import { stripPropTypes } from './stripPropTypes.js';
import { collapseStyles } from './collapseStyles.js';
import { stripTypeAnnotations } from './stripTypeAnnotations.js';
import { stripTestAttributes } from './stripTestAttributes.js';
import { stripJsxAttributes } from './stripJsxAttributes.js';
import { skeletonizeJsxFull as skeletonizeJsx } from './skeletonizeJsx.js';
import { collapseHelperBodies } from './collapseHelperBodies.js';
import { pruneUnusedImports } from './pruneUnusedImports.js';
import { skeletonizeTypes } from './skeletonizeTypes.js';

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
  // V2 aggressive skeletonization
  ['collapseHelperBodies', collapseHelperBodies],
  ['stripJsxAttributes', stripJsxAttributes],
  ['skeletonizeJsx', skeletonizeJsx],
  // V3 enterprise bloat — run last so they see the post-pruned AST
  ['skeletonizeTypes', skeletonizeTypes],
  ['pruneUnusedImports', pruneUnusedImports],
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
  stripJsxAttributes,
  skeletonizeJsx,
  collapseHelperBodies,
  pruneUnusedImports,
  skeletonizeTypes,
};
