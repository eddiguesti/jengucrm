/**
 * Compare Local vs Production
 * Check for discrepancies between local and deployed versions
 */

import * as fs from 'fs';
import * as path from 'path';

console.log('🔍 LOCAL VS PRODUCTION COMPARISON\n');
console.log('='.repeat(80));

// 1. Check if .next build exists locally
console.log('\n📦 Build Status:');
console.log('-'.repeat(80));

const nextDir = path.join(process.cwd(), '.next');
if (fs.existsSync(nextDir)) {
  const stats = fs.statSync(nextDir);
  console.log(`✅ Local build exists (.next/)`);
  console.log(`   Last modified: ${stats.mtime.toLocaleString()}`);
} else {
  console.log(`⚠️  No local build found (.next/ missing)`);
  console.log(`   Run: npm run build`);
}

// 2. Check git status
console.log('\n📝 Git Status:');
console.log('-'.repeat(80));

try {
  const { execSync } = require('child_process');

  const status = execSync('git status --short').toString().trim();
  if (status) {
    console.log(`⚠️  Uncommitted changes:`);
    console.log(status.split('\n').map(l => `   ${l}`).join('\n'));
  } else {
    console.log(`✅ Working directory clean`);
  }

  const ahead = execSync('git log origin/main..HEAD --oneline').toString().trim();
  if (ahead) {
    console.log(`⚠️  Local commits not pushed:`);
    console.log(ahead.split('\n').map(l => `   ${l}`).join('\n'));
  } else {
    console.log(`✅ Local and remote in sync`);
  }

  const behind = execSync('git log HEAD..origin/main --oneline').toString().trim();
  if (behind) {
    console.log(`⚠️  Remote commits not pulled:`);
    console.log(behind.split('\n').map(l => `   ${l}`).join('\n'));
  }
} catch (err) {
  console.log(`❌ Git check failed:`, err);
}

// 3. Check key configuration files
console.log('\n⚙️  Configuration Files:');
console.log('-'.repeat(80));

const configFiles = [
  'tailwind.config.ts',
  'next.config.js',
  'next.config.mjs',
  'postcss.config.js',
  'postcss.config.mjs',
  '.env.local',
  '.env.production',
];

for (const file of configFiles) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (modified: ${stats.mtime.toLocaleDateString()})`);
  }
}

// 4. Check package.json for build script
console.log('\n📜 Build Configuration:');
console.log('-'.repeat(80));

const pkgPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  console.log(`Build script: ${pkg.scripts?.build || 'NOT FOUND'}`);
  console.log(`Framework: ${pkg.dependencies?.next || 'unknown'}`);
  console.log(`React: ${pkg.dependencies?.react || 'unknown'}`);
}

// 5. Common issues checklist
console.log('\n🔍 Common Design Discrepancies:');
console.log('-'.repeat(80));

console.log(`
1️⃣  **Tailwind CSS not applied in production**
   Cause: CSS not properly imported or PostCSS config missing
   Check:
   - app/globals.css has @tailwind directives
   - postcss.config.js exists
   - tailwind.config.ts has correct content paths

2️⃣  **Fonts not loading in production**
   Cause: next/font not properly configured or paths wrong
   Check:
   - Font files in public/ or using next/font/google
   - Font declarations in layout.tsx

3️⃣  **Images not showing in production**
   Cause: Paths incorrect or next/image config wrong
   Check:
   - Images in public/ use absolute paths (/image.png)
   - next.config has proper image domains

4️⃣  **CSS modules not working**
   Cause: Import paths wrong or build config issue
   Check:
   - .module.css files properly imported
   - Naming convention correct

5️⃣  **Dark mode broken in production**
   Cause: next-themes or class strategy not working
   Check:
   - next-themes provider in layout
   - tailwind dark: class strategy
   - suppressHydrationWarning on html tag

6️⃣  **Environment variables**
   Cause: NEXT_PUBLIC_ prefix missing or not in Vercel
   Check:
   - All client-side vars have NEXT_PUBLIC_ prefix
   - Variables set in Vercel dashboard

7️⃣  **Cache issues**
   Cause: Browser or CDN caching old version
   Solution:
   - Hard refresh: Ctrl+Shift+R
   - Clear site data in DevTools
   - Check Vercel deployment URL (not custom domain)
`);

console.log('\n📋 Recommended Actions:');
console.log('-'.repeat(80));
console.log(`
1. Compare local vs production visually:
   - Local: http://localhost:3000
   - Production: https://crm.jengu.ai
   - Direct Vercel URL: Check Vercel dashboard

2. Check Vercel deployment logs:
   - https://vercel.com/eddiguesti/jengucrm/deployments
   - Look for build errors or warnings

3. Inspect production build:
   - Open DevTools on production site
   - Check Console for errors
   - Check Network tab for 404s or failed CSS/JS

4. Test production build locally:
   npm run build
   npm start
   # Visit http://localhost:3000

5. If styles missing, rebuild Tailwind:
   npx tailwindcss -i ./app/globals.css -o ./dist/output.css
`);

console.log('\n✅ Analysis Complete!\n');
