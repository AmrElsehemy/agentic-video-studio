import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('videos');
const ids = [];

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === 'video.json') {
      const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
      ids.push(manifest.id);
    }
  }
};

walk(root);
ids.sort();
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(ids));
else ids.forEach((id) => console.log(id));
