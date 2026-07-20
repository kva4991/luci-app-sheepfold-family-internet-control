import js from '@eslint/js';
import globals from 'globals';

const luciGlobals = {
  E: 'readonly',
  L: 'readonly',
  _: 'readonly',
  Request: 'readonly',
  administratorEditor: 'readonly',
  administratorModel: 'readonly',
  administratorView: 'readonly',
  backupModel: 'readonly',
  baseclass: 'readonly',
  deviceAccessLists: 'readonly',
  deviceEditor: 'readonly',
  deviceInventory: 'readonly',
  deviceSelection: 'readonly',
  deviceTableModel: 'readonly',
  deviceTypes: 'readonly',
  downloads: 'readonly',
  emergencySiteModel: 'readonly',
  feedbackPanel: 'readonly',
  form: 'readonly',
  fs: 'readonly',
  groupEditor: 'readonly',
  groupModel: 'readonly',
  groupView: 'readonly',
  integrationPanel: 'readonly',
  logModel: 'readonly',
  logPanelModel: 'readonly',
  messengerSettings: 'readonly',
  notificationSettings: 'readonly',
  overview: 'readonly',
  pairingQr: 'readonly',
  routerBackend: 'readonly',
  routerInfo: 'readonly',
  routerMaintenance: 'readonly',
  scheduleEditor: 'readonly',
  scheduleModel: 'readonly',
  scheduleView: 'readonly',
  secureOverview: 'readonly',
  secureRandom: 'readonly',
  settingsBackupModel: 'readonly',
  settingsBackupPanelModel: 'readonly',
  settingsDraftModel: 'readonly',
  sharedForms: 'readonly',
  sharedIcons: 'readonly',
  sheepfoldI18n: 'readonly',
  siteListStatus: 'readonly',
  storagePanelModel: 'readonly',
  uci: 'readonly',
  ui: 'readonly',
  view: 'readonly',
  wifiCards: 'readonly',
  wifiEditorModel: 'readonly',
  wifiPayload: 'readonly',
};

const commonRules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', {
    args: 'none',
    caughtErrors: 'none',
    varsIgnorePattern: '^_$',
  }],
};

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    ignores: [
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '.build/**',
      'tools/.cache/**',
      'tools/local/**',
    ],
  },
  {
    files: [
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      parserOptions: {
        // LuCI выполняет ресурс внутри своей функции-модуля, поэтому return в файле допустим.
        ecmaFeatures: {
          globalReturn: true,
        },
      },
      globals: {
        ...globals.browser,
        ...luciGlobals,
      },
    },
    rules: commonRules,
  },
  {
    files: [
      'eslint.config.js',
      'scripts/**/*.mjs',
      'tests/**/*.mjs',
      'tools/**/*.mjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: commonRules,
  },
  {
    files: ['tools/router-testing/frontendAudit.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
