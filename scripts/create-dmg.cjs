// Packages usb-build/ (the app next to its runtime/ and models/ sibling
// folders) into a single .dmg file. Unlike a raw folder copy, a .dmg is one
// regular file - it can sit on a FAT32/exFAT USB drive without hitting the
// symlink/permission loss that breaks a plain copy of a macOS .app bundle.
// The user still has to drag the contents out to a real Mac filesystem
// (Desktop, /Applications, ...) before running - a .dmg cannot make the app
// runnable directly off a FAT32/exFAT drive, since that's a filesystem
// limitation, not a packaging one.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const sourceDirectory = path.join(root, 'usb-build')
const outputPath = path.join(root, 'PORTABLE.AI.dmg')

const main = () => {
  if (process.platform !== 'darwin') {
    throw new Error('Building a .dmg requires macOS (hdiutil).')
  }
  if (!fs.existsSync(sourceDirectory)) {
    throw new Error('No usb-build/ folder found. Run "npm run usb:prepare" first.')
  }

  fs.rmSync(outputPath, { force: true })
  execFileSync('hdiutil', ['create', '-volname', 'PORTABLE.AI', '-srcfolder', sourceDirectory, '-ov', '-format', 'UDZO', outputPath], { stdio: 'inherit' })

  console.log(`\nDMG ready at: ${outputPath}`)
  console.log('Copy this single file to a pendrive. On any Mac: double-click it, then drag everything inside out to that Mac\'s local drive (e.g. Desktop) before running PORTABLE.AI.app.')
}

main()
