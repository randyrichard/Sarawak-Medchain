import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/layout'
import Dashboard from './pages/Dashboard'
import Incidents from './pages/Incidents'
import IncidentDetail from './pages/IncidentDetail'
import RootCause from './pages/RootCause'
import Sites from './pages/Sites'
import Actions from './pages/Actions'
import Audit from './pages/Audit'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/root-cause" element={<RootCause />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
