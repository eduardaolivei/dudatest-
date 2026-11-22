import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext';
import { CloudProvider } from './store/CloudContext';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';

// Code-splitting: each page is downloaded only when first opened (faster start on phones).
const Transactions = lazy(() => import('./pages/Transactions'));
const Bills = lazy(() => import('./pages/Bills'));
const Cards = lazy(() => import('./pages/Cards'));
const Goals = lazy(() => import('./pages/Goals'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Planner = lazy(() => import('./pages/Planner'));
const Week = lazy(() => import('./pages/Week'));
const Reports = lazy(() => import('./pages/Reports'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Recurring = lazy(() => import('./pages/Recurring'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Settings = lazy(() => import('./pages/Settings'));
const More = lazy(() => import('./pages/More'));

export default function App() {
  return (
    <StoreProvider>
      <CloudProvider>
      <HashRouter>
        <Layout>
          <Suspense fallback={<div className="py-10 text-center text-sm muted">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/cards" element={<Cards />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/week" element={<Week />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/recurring" element={<Recurring />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/more" element={<More />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </HashRouter>
      </CloudProvider>
    </StoreProvider>
  );
}
