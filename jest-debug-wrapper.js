const { execSync } = require('child_process');
const path = process.argv[2]; // Get the file path from VS Code
const escapedPath = path.replace(/\[/g, '\\[').replace(/\]/g, '\\]'); // Escape brackets
execSync(`npx jest --testPathPattern="${escapedPath}" --runInBand --config jest.config.ts --testTimeout=100000 --verbose`, { stdio: 'inherit' });