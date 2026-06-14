const fs = require('fs');
const path = require('path');

const deps = ['express', 'multer', 'qrcode', 'sharp', 'ws'];
const failures = [];

for (const dep of deps) {
  try {
    const packageJson = path.join(process.cwd(), 'node_modules', dep, 'package.json');
    JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    require(dep);
  } catch (err) {
    failures.push(`${dep}: ${err.message}`);
  }
}

if (failures.length) {
  console.error('Dependency check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Dependency check passed.');
