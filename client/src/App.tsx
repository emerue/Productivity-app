import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useData } from './data/store';
import { boot } from './data/sync';
import { applyTheme } from './lib/theme';
import { FocusScreen } from './screens/Focus';
import { ListsScreen } from './screens/Lists';
import { ListScreen } from './screens/ListView';
import { LoginScreen } from './screens/Login';
import { MatrixScreen, QuadrantScreen } from './screens/Matrix';
import { MyDayScreen } from './screens/MyDay';
import { PlanScreen } from './screens/Plan';
import { SettingsScreen } from './screens/Settings';
import { FocusResume } from './components/FocusResume';

export function App() {
  const status = useData((s) => s.status);
  const theme = useData((s) => s.settings.theme);

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    if (status === 'ready') applyTheme(theme);
  }, [status, theme]);

  if (status === 'loading') return <div className="boot" aria-busy="true" />;

  return (
    <BrowserRouter>
      {status === 'ready' ? (
        <>
          <FocusResume />
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/focus/:taskId" element={<FocusScreen />} />
            <Route path="/plan" element={<PlanScreen />} />
            <Route element={<Shell />}>
              <Route index element={<MyDayScreen />} />
              <Route path="matrix" element={<MatrixScreen />} />
              <Route path="matrix/:quadrant" element={<QuadrantScreen />} />
              <Route path="lists" element={<ListsScreen />} />
              <Route path="lists/:listId" element={<ListScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </>
      ) : (
        <Routes>
          <Route path="*" element={<LoginScreen />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
