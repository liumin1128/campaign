#!/usr/bin/env node

/**
 * 打包 Teams App manifest 为 .zip 文件
 * 使用方法: node scripts/package-manifest.mjs
 *
 * 注意: 需要先将 color.svg 和 outline.svg 转换为 color.png (192x192) 和 outline.png (32x32)
 * 并替换 manifest.json 中的占位符
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const manifestDir = resolve(rootDir, "teams-manifest");
const distDir = resolve(rootDir, "dist");

// 读取 .env.local 配置
function loadEnv() {
  const envPath = resolve(rootDir, ".env.local");
  const env = {};
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
  }
  return env;
}

const env = loadEnv();

// 替换 manifest 中的占位符
let manifest = readFileSync(resolve(manifestDir, "manifest.json"), "utf-8");
manifest = manifest.replace(
  /\{\{TEAMS_APP_ID\}\}/g,
  env.TEAMS_APP_ID || "00000000-0000-0000-0000-000000000000",
);
manifest = manifest.replace(
  /\{\{BOT_ID\}\}/g,
  env.BOT_ID || "00000000-0000-0000-0000-000000000000",
);
manifest = manifest.replace(
  /\{\{BASE_URL\}\}/g,
  env.BASE_URL || "https://localhost:3000",
);
manifest = manifest.replace(
  /\{\{DOMAIN\}\}/g,
  new URL(env.BASE_URL || "https://localhost:3000").hostname,
);

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, "manifest.json"), manifest);

// 检查是否有 PNG 图标
const colorIcon = existsSync(resolve(manifestDir, "color.png"))
  ? resolve(manifestDir, "color.png")
  : null;
const outlineIcon = existsSync(resolve(manifestDir, "outline.png"))
  ? resolve(manifestDir, "outline.png")
  : null;

if (!colorIcon || !outlineIcon) {
  console.warn("⚠️  缺少 PNG 图标文件，请将 SVG 转换为 PNG:");
  console.warn("   color.png (192x192) 和 outline.png (32x32)");
  console.warn("   暂时使用空文件占位");
  // 创建空占位文件
  if (!colorIcon) writeFileSync(resolve(distDir, "color.png"), "");
  if (!outlineIcon) writeFileSync(resolve(distDir, "outline.png"), "");
} else {
  execSync(`cp "${colorIcon}" "${distDir}/color.png"`);
  execSync(`cp "${outlineIcon}" "${distDir}/outline.png"`);
}

// 打包为 zip
const zipPath = resolve(distDir, "teams-app.zip");
execSync(
  `cd "${distDir}" && zip -j "${zipPath}" manifest.json color.png outline.png`,
);

console.log(`✅ Teams app 包已生成: ${zipPath}`);
