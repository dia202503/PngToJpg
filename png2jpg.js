#!/usr/bin/env node
// png2jpg.js
// Usage:
//   node png2jpg.js <directory> [--recursive] [--quality 90] [--bg "#ffffff"] [--keep]
//
// - <directory>   : 変換対象ディレクトリ（例：/sdcard/Pictures）
// - --recursive   : サブディレクトリも再帰的に処理
// - --quality     : JPEG品質（1-100, 既定90）
// - --bg          : 透過を埋める背景色（#rrggbb, 既定 #ffffff）
// - --keep        : 変換後も PNG を削除しない（既定は削除 = 置き換え）
//
// 例:
//   node png2jpg.js /sdcard/Pictures --recursive --quality 85 --bg "#fefefe"

const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");
const Jimp = require("jimp");

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node png2jpg.js <directory> [--recursive] [--quality 90] [--bg \"#ffffff\"] [--keep]");
    process.exit(1);
  }
  const opts = {
    dir: null,
    recursive: false,
    quality: 90,
    bg: "#ffffff",
    keep: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!opts.dir && !a.startsWith("--")) {
      opts.dir = a;
    } else if (a === "--recursive") {
      opts.recursive = true;
    } else if (a === "--keep") {
      opts.keep = true;
    } else if (a === "--quality") {
      const q = parseInt(args[i + 1], 10);
      if (Number.isFinite(q) && q >= 1 && q <= 100) {
        optsquality = q; // typo guard
        opts.quality = q;
      }
      i++;
    } else if (a === "--bg") {
      opts.bg = args[i + 1] || "#ffffff";
      i++;
    }
  }
  if (!opts.dir) {
    console.error("Error: <directory> is required.");
    process.exit(1);
  }
  return opts;
}

function toRgb(hex) {
  // Accepts #rgb or #rrggbb
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? [...h].map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid color: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

async function convertOne(filePath, { quality, bg, keep }) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}.jpg`);

  // 読み込み
  const image = await Jimp.read(filePath);

  // 透過を背景色で埋める（JPEG はアルファ非対応）
  const { r, g, b } = toRgb(bg);
  const canvas = new Jimp(image.bitmap.width, image.bitmap.height, Jimp.rgbaToInt(r, g, b, 255));
  canvas.composite(image, 0, 0);

  // 品質指定で JPEG 書き出し
  await canvas.quality(quality).writeAsync(outPath);

  // PNG を削除（--keep が無ければ）
  if (!keep) {
    await fs.promises.unlink(filePath);
  }

  return outPath;
}

(async () => {
  try {
    const opts = parseArgs();
    const root = path.resolve(opts.dir);

    // 検索パターン（大文字小文字区別なし）
    const pattern = opts.recursive ? "**/*.{png,PNG}" : "*.{png,PNG}";

    // symlink などはスキップ、隠しファイルも対象
    const files = await fg(pattern, {
      cwd: root,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
      unique: true,
      suppressErrors: true,
    });

    if (files.length === 0) {
      console.log("対象 PNG が見つかりませんでした。");
      process.exit(0);
    }

    console.log(`変換対象: ${files.length} ファイル`);
    let ok = 0, ng = 0;

    for (const rel of files) {
      const full = path.join(root, rel);
      try {
        const out = await convertOne(full, opts);
        console.log(`OK: ${rel} -> ${path.basename(out)}`);
        ok++;
      } catch (err) {
        console.error(`NG: ${rel} (${err.message})`);
        ng++;
      }
    }

    console.log(`完了: 成功 ${ok}, 失敗 ${ng}`);
    process.exit(ng > 0 ? 2 : 0);
  } catch (e) {
    console.error("致命的エラー:", e.message);
    process.exit(1);
  }
})();
