/** The one undo service the server uses (store + real data access). Imported lazily by middleware.js and routes/history.js. */
import { createUndoService } from './undo.js';
import { undoStore } from './undoStore.js';
import { undoIo } from './undoIo.js';

export const undoService = createUndoService({ store: undoStore, io: undoIo });
export default undoService;
