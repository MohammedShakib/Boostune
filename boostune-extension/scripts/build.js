const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target || !['chromium', 'firefox'].includes(target)) {
  console.error('Usage: node build.js <chromium|firefox>');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist', target);
const configDir = path.join(rootDir, 'config');

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy files and directories
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const dirsToCopy = ['src', 'assets'];
dirsToCopy.forEach((dir) => {
  const src = path.join(rootDir, dir);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, path.join(distDir, dir));
  }
});

const filesToCopy = ['README.md', 'PRIVACY.md', 'LICENSE', 'TESTING.md'];
filesToCopy.forEach((file) => {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
});

// Merge manifests
const baseManifest = JSON.parse(fs.readFileSync(path.join(configDir, 'manifest.base.json'), 'utf-8'));
const targetManifest = JSON.parse(fs.readFileSync(path.join(configDir, `manifest.${target}.json`), 'utf-8'));

const mergedManifest = { ...baseManifest, ...targetManifest };

// Write manifest
fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(mergedManifest, null, 2));

console.log(`Successfully built ${target} extension to dist/${target}/`);
