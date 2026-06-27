// Build tkg.html from src/ before the browser smoke tests run, so the bundle the
// tests load always reflects the current src/ modules.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const root = path.resolve(__dirname, '..', '..');
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
};
