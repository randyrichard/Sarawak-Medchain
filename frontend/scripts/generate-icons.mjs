import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const iconsDir = join(__dirname, '../public/icons');

// Ensure icons directory exists
await mkdir(iconsDir, { recursive: true });

// Icon configurations
const icons = [
  {
    name: 'gov',
    bgColor: '#030712',
    shieldColor: '#d97706', // Gold
    letter: 'G',
  },
  {
    name: 'verify',
    bgColor: '#030712',
    shieldColor: '#0ea5e9', // Blue
    letter: '✓',
  },
  {
    name: 'issue',
    bgColor: '#030712',
    shieldColor: '#10b981', // Green
    letter: '+',
  },
  {
    name: 'main',
    bgColor: '#030712',
    shieldColor: '#ef4444', // Red
    letter: 'M',
  },
];

// Generate SVG for each icon
function generateSVG(config) {
  const { bgColor, shieldColor, letter } = config;

  // Determine text properties based on letter
  const isSymbol = letter === '✓' || letter === '+';
  const fontSize = isSymbol ? 72 : 56;
  const textY = isSymbol ? 105 : 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="36" fill="${bgColor}"/>
  <path d="M90 28 L140 55 L140 92 C140 120 118 145 90 155 C62 145 40 120 40 92 L40 55 Z" fill="${shieldColor}"/>
  <text x="90" y="${textY}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${bgColor}">${letter}</text>
</svg>`;
}

// Generate icons
for (const icon of icons) {
  const svg = generateSVG(icon);

  // Generate 180x180 PNG for iOS
  await sharp(Buffer.from(svg))
    .resize(180, 180)
    .png()
    .toFile(join(iconsDir, `${icon.name}-180.png`));

  // Generate 192x192 PNG for Android
  await sharp(Buffer.from(svg))
    .resize(192, 192)
    .png()
    .toFile(join(iconsDir, `${icon.name}-192.png`));

  // Generate 512x512 PNG
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, `${icon.name}-512.png`));

  console.log(`✓ Generated ${icon.name} icons (180, 192, 512)`);
}

console.log('\nAll icons generated successfully!');
