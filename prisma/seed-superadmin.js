const { spawnSync } = require('child_process');
const path = require('path');

const seedTsPath = path.join(__dirname, 'seed.ts');
const result = spawnSync('npx', ['tsx', seedTsPath], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
