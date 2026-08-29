import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const client = join(dist, 'client');
const server = join(dist, 'server');
const files = [
  'index.html',
  'island-quest.css',
  'island-quest.js',
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'word-picture-sprite-v55.png',
  'sound-the-word-capybara.png',
  'sky-high-balloon.png',
  'og.png'
];
const directories = ['vendor', 'word-detective-sprites'];

await rm(dist, { recursive:true, force:true });
await mkdir(client, { recursive:true });
await mkdir(server, { recursive:true });
await Promise.all(files.map(file => cp(join(root, file), join(client, file))));
await Promise.all(directories.map(directory => cp(join(root, directory), join(client, directory), { recursive:true })));
await cp(join(root, 'server', 'index.js'), join(server, 'index.js'));

const entries = await readdir(client);
console.log(`Built Spelling Quest with ${entries.length} top-level client assets.`);
