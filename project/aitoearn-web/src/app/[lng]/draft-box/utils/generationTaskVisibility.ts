import type { DraftGenerationTask } from '@/api/draftGeneration'

/**
 * Queue cards: in-progress + all failures (even with no partial media).
 * Success leaves the queue; results appear in media/draft lists.
 */
export function shouldShowDraftGenerationTaskCard(task: Pick<DraftGenerationTask, 'status'>) {
  return task.status === 'generating' || task.status === 'failed'
}
