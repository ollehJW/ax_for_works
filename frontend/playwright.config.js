import { defineConfig } from '@playwright/test';
const localTLS = Boolean(process.env.AX_TEST_TLS_CERT && process.env.AX_TEST_TLS_KEY);
const localURL = `${localTLS ? 'https' : 'http'}://127.0.0.1:8000`;
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const tlsArgs = localTLS ? ` --ssl-certfile ${quote(process.env.AX_TEST_TLS_CERT)} --ssl-keyfile ${quote(process.env.AX_TEST_TLS_KEY)}` : '';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: true,
  use: {
    baseURL: process.env.AX_TEST_URL || localURL,
    // The local test host is 127.0.0.1; production certificates are still verified.
    ignoreHTTPSErrors: localTLS && !process.env.AX_TEST_URL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  webServer: process.env.AX_TEST_URL ? undefined : {
    command: '../.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --app-dir ..' + tlsArgs,
    url: localURL + '/api/health', ignoreHTTPSErrors: localTLS, reuseExistingServer: false,
  },
});
