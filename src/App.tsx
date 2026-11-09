import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import More from './pages/More';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Bills from './pages/Bills';
import Recurring from './pages/Recurring';

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/more" element={<More />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </StoreProvider>
  );
}
