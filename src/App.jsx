import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router'
import { AuthProvider, RequireAuth } from './lib/auth'
import { Splash, Logo } from './components/ui'
import Landing from './pages/Landing'
import Join from './pages/Join'
import Play from './pages/Play'
import Login from './pages/Login'

// Strony nauczyciela ładowane osobno — telefon ucznia pobiera tylko Join + Play.
const AppLayout = lazy(() => import('./components/AppLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Library = lazy(() => import('./pages/Library'))
const NewQuiz = lazy(() => import('./pages/NewQuiz'))
const QuizView = lazy(() => import('./pages/QuizView'))
const Editor = lazy(() => import('./pages/Editor'))
const Stats = lazy(() => import('./pages/Stats'))
const GameReport = lazy(() => import('./pages/GameReport'))
const Settings = lazy(() => import('./pages/Settings'))
const Host = lazy(() => import('./pages/Host'))

function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="stack center" style={{ alignItems: 'center' }}>
        <Logo />
        <h1 className="h2">Nie ma takiej strony.</h1>
        <Link to="/" className="btn btn-primary">Na start</Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/join" element={<Join />} />
            <Route path="/join/:pin" element={<Join />} />
            <Route path="/play/:gameId" element={<Play />} />
            <Route path="/host/:gameId" element={<RequireAuth><Host /></RequireAuth>} />
            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="library" element={<Library />} />
              <Route path="new" element={<NewQuiz />} />
              <Route path="quiz/:id" element={<QuizView />} />
              <Route path="quiz/:id/edit" element={<Editor />} />
              <Route path="stats" element={<Stats />} />
              <Route path="stats/:gameId" element={<GameReport />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
