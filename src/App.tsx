/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider } from './context/AuthContext';
import { TimesheetApp } from './components/TimesheetApp';

export default function App() {
  return (
    <AuthProvider>
      <TimesheetApp />
    </AuthProvider>
  );
}
