import { useContext } from 'react';
import DraftSyncContext from '../context/DraftSyncContext.js';

export default function useDraftSync() {
  const context = useContext(DraftSyncContext);
  if (!context) throw new Error('useDraftSync must be used inside <DraftSyncProvider>');
  return context;
}
