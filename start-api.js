/**
 * Helper script to start the API server
 * Can be run with: node start-api.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting X-Ray API server...');
console.log('Server will run on http://localhost:3001');
console.log('Press Ctrl+C to stop\n');

const apiProcess = spawn('npm', ['start'], {
  cwd: path.join(__dirname, 'api'),
  stdio: 'inherit',
  shell: true,
});

apiProcess.on('close', (code) => {
  console.log(`\nAPI server exited with code ${code}`);
});

process.on('SIGINT', () => {
  console.log('\nStopping API server...');
  apiProcess.kill();
  process.exit();
});

