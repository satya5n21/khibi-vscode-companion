// tsc emits CommonJS for renderer.ts (it contains `import type`). The browser has no `exports`,
// so define it here instead of with an inline <script>, which lets the CSP stay `script-src 'self'`.
var exports = {};
