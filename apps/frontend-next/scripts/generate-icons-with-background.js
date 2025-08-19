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
    // Calculate positioning for V, cross, and M - keep them compact like original V|M
    const letterFontSize = Math.floor(circleRadius * 0.8);
    const spacing = letterFontSize * 0.5; // Balanced spacing for cross visibility

    const leftX = circleCenter - spacing * 0.9; // Adjust V closer to center
    const rightX = circleCenter + spacing * 1.0; // Adjust M slightly further from center
    const textY = circleCenter + letterFontSize * 0.08;

    // Cross dimensions - integrated with letters
    const crossVertical = letterFontSize * 0.9; // Taller to match letter height
    const crossHorizontal = spacing * 1; // Reduced length to fit better with letters
    const crossThickness = letterFontSize * 0.1;
    const crossTopOffset = crossVertical * 0.15; // Move horizontal bar up from center

    // Create SVG with circular design and safe area
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="transparent"/>
        <circle cx="${circleCenter}" cy="${circleCenter}" r="${circleRadius}" fill="${THEME_COLOR}"/>
        
        <!-- V letter -->
        <text x="${leftX}" y="${textY}" 
              font-family="Arial, sans-serif" 
              font-size="${letterFontSize}" 
              font-weight="bold" 
              fill="white" 
              text-anchor="middle" 
              dominant-baseline="central">V</text>
        
        <!-- Christian Cross -->
        <g fill="white">
          <!-- Vertical bar of cross -->
          <rect x="${circleCenter - crossThickness / 2}" 
                y="${circleCenter - crossVertical / 2}" 
                width="${crossThickness}" 
                height="${crossVertical}" />
          <!-- Horizontal bar of cross (positioned higher than center like a Christian cross) -->
          <rect x="${circleCenter - crossHorizontal / 2}" 
                y="${circleCenter - crossTopOffset - crossThickness / 2}" 
                width="${crossHorizontal}" 
                height="${crossThickness}" />
        </g>
        
        <!-- M letter -->
        <text x="${rightX}" y="${textY}" 
              font-family="Arial, sans-serif" 
              font-size="${letterFontSize}" 
              font-weight="bold" 
              fill="white" 
              text-anchor="middle" 
              dominant-baseline="central">M</text>
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
