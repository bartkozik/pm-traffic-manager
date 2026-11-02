import { I18nextProvider } from 'react-i18next';
import { HelmetProvider } from 'react-helmet-async';
import { MantineProvider } from '@mantine/core';

import { ThemeProvider } from '@/core/theme/theme';
import { RouterProvider as ReactRouterProvider } from "react-router-dom";
import { router } from "./routes";

import i18n from '@/app/i18n/i18n';
import { AuthGate } from '@/modules/auth/AuthGate';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import '@mantine/core/styles.css';
import 'mantine-datatable/styles.css';
import '@/modules/traffic/styles/trafficBase.css';

export default function App() {
  return (
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <MantineProvider>
            <AuthProvider>
              <AuthGate>
                <ReactRouterProvider router={router} />
              </AuthGate>
            </AuthProvider>
          </MantineProvider>
        </ThemeProvider>
      </I18nextProvider>
    </HelmetProvider>
  );
}
