// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withUniwindConfig } = require('uniwind/metro');

const config = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});

// The repo authors relative imports with explicit `.js` extensions (TS/NodeNext style,
// resolved natively by tsc + Vite). Metro does not rewrite `.js` → `.ts/.tsx`, so a relative
// `./foo.js` pointing at `foo.tsx` fails to resolve. Strip the `.js` and let Metro's sourceExts
// resolve the real source; fall back to the original specifier for genuine `.js` files.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (/^\.\.?\//.test(moduleName) && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.slice(0, -'.js'.length), platform);
    } catch {
      // genuine .js file (or not found extensionless) — fall through to original below
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
