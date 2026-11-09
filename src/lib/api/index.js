import { isConfigured } from '../supabase'
import { supabaseApi } from './supabaseApi'
import { localApi } from './localApi'
import { SAMPLE_QUIZ } from './sample'

export const api = isConfigured ? supabaseApi : localApi
export const isDemo = !isConfigured

export async function duplicateQuiz(id) {
  const q = await api.getQuiz(id)
  if (!q) throw new Error('Nie znaleziono quizu.')
  return api.createQuiz(
    { title: `${q.title} (kopia)`.slice(0, 120), description: q.description, cover: q.cover, tags: q.tags, is_public: false },
    q.questions,
  )
}

export function createSampleQuiz() {
  return api.createQuiz(SAMPLE_QUIZ.meta, SAMPLE_QUIZ.questions)
}
