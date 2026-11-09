import { useState } from 'react'
import { api, duplicateQuiz } from '../lib/api'
import { Modal, ErrorBox, useToast } from './ui'
import StartGameModal from './StartGameModal'

// Wspólne akcje na quizach: graj / duplikuj / usuń (+ ich okna)
export function useQuizActions(onChange) {
  const [playQuiz, setPlayQuiz] = useState(null)
  const [delQuiz, setDelQuiz] = useState(null)
  const [delError, setDelError] = useState(null)
  const [toast, showToast] = useToast()

  async function duplicate(q) {
    try {
      const id = await duplicateQuiz(q.id)
      showToast('Skopiowano do Twoich quizów')
      onChange?.()
      return id
    } catch (e) {
      showToast(e.message)
    }
  }

  async function confirmDelete() {
    try {
      await api.deleteQuiz(delQuiz.id)
      setDelQuiz(null)
      showToast('Quiz usunięty')
      onChange?.()
    } catch (e) {
      setDelError(e)
    }
  }

  const modals = (
    <>
      {playQuiz && <StartGameModal quiz={playQuiz} onClose={() => setPlayQuiz(null)} />}
      {delQuiz && (
        <Modal title={`Usunąć „${delQuiz.title}”?`} subtitle="Tej operacji nie da się cofnąć. Statystyki rozegranych gier zostaną."
          onClose={() => { setDelQuiz(null); setDelError(null) }}>
          <div className="stack">
            <ErrorBox error={delError} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDelQuiz(null)}>Anuluj</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Usuń quiz</button>
            </div>
          </div>
        </Modal>
      )}
      {toast}
    </>
  )

  return { play: setPlayQuiz, duplicate, remove: setDelQuiz, modals }
}
