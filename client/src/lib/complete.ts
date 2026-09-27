import { stepProgress } from '@frog/shared';
import { completeTaskNow } from '../data/actions';
import { useData } from '../data/store';
import { askConfirm } from '../data/ui';

/** Completes a task, asking once when steps are still open. */
export async function requestComplete(id: string): Promise<boolean> {
  const task = useData.getState().tasks[id];
  if (!task) return false;
  const { done, total } = stepProgress(task);
  const open = total - done;
  if (open > 0) {
    const ok = await askConfirm(
      `${open} ${open === 1 ? 'step' : 'steps'} still open. Complete anyway?`,
      'Complete',
    );
    if (!ok) return false;
  }
  completeTaskNow(id);
  return true;
}
