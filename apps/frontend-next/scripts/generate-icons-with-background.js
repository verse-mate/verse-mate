#!/usr/bin/env node

const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = path.join(__dirname, "../public/icons");

// Theme color from manifest.json
const THEME_COLOR = "#1a365d";

async function generateIcon(size) {
  const outputFile = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

  try {
    // Generate maskable icons with 10% safe area padding
    const padding = Math.floor(size * 0.1);
    const circleRadius = (size - padding * 2) / 2;
    const circleCenter = size / 2;
    const fontSize = Math.floor(circleRadius * 0.8);

    const text = "V|M"; // Add separator with spaces between V and M

    // Create SVG with circular design and safe area
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="transparent"/>
        <circle cx="${circleCenter}" cy="${circleCenter}" r="${circleRadius}" fill="${THEME_COLOR}"/>
        <text x="${circleCenter}" y="${circleCenter + fontSize * 0.08}" 
              font-family="Arial, sans-serif" 
              font-size="${fontSize}" 
              font-weight="bold" 
              fill="white" 
              text-anchor="middle" 
              dominant-baseline="central">${text}</text>
      </svg>
    `;

    // Convert SVG to PNG
    await sharp(Buffer.from(svg)).png().toFile(outputFile);

    console.log(`✅ Generated circular icon: ${outputFile}`);
  } catch (error) {
    console.error(
      `❌ Error generating ${size}x${size} circular icon:`,
      error.message,
    );
  }
}

async function main() {
  console.log("🎨 Generating circular icons for VerseMate PWA...\n");

  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate all icon sizes
  for (const size of ICON_SIZES) {
    await generateIcon(size);
  }

  console.log("\n✨ All circular icons generated successfully!");
  console.log(
    "📝 Remember to update manifest.json to use the new circular icons.",
  );
}

main().catch(console.error);
