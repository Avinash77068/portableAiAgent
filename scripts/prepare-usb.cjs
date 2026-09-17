// Assembles a ready-to-copy USB folder: the built .app next to runtime/ and
// models/ as sibling folders, matching how resolvePortableRoot() looks them up
// on a packaged, double-click-to-run build (see electron/database/database.cjs).
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const releaseDirectory = path.join(root, 'release')
const outputDirectory = path.join(root, 'usb-build')

const findAppBundle = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name.endsWith('.app')) return entryPath
    if (entry.isDirectory()) {
      const found = findAppBundle(entryPath)
      if (found) return found
    }
  }
  return null
}

const main = () => {
  if (!fs.existsSync(releaseDirectory)) {
    throw new Error('No release/ folder found. Run "npm run dist:mac" first.')
  }

  const appBundle = findAppBundle(releaseDirectory)
  if (!appBundle) {
    throw new Error('No .app bundle found under release/. Run "npm run dist:mac" first.')
  }

  fs.rmSync(outputDirectory, { recursive: true, force: true })
  fs.mkdirSync(outputDirectory, { recursive: true })

  if (process.platform === 'darwin') {
    // electron-builder skips signing entirely when no Developer ID certificate is
    // installed. On Apple Silicon a fully unsigned multi-process Electron app
    // crashes its Helper processes on launch (EXC_BREAKPOINT/SIGTRAP), so ad-hoc
    // sign it ourselves - sufficient for running locally / from a USB drive.
    // Must happen BEFORE copying: the app's internal frameworks rely on exact
    // symlinks that a generic recursive copy can mangle, breaking the signature.
    execFileSync('codesign', ['--deep', '--force', '--sign', '-', appBundle], { stdio: 'inherit' })
    console.log('Ad-hoc signed the app bundle')
  }

  const appDestination = path.join(outputDirectory, path.basename(appBundle))
  if (process.platform === 'darwin') {
    // ditto (not a recursive fs copy) preserves the code signature and the
    // framework symlink structure exactly.
    execFileSync('ditto', [appBundle, appDestination], { stdio: 'inherit' })
  } else {
    fs.cpSync(appBundle, appDestination, { recursive: true })
  }
  console.log(`Copied ${path.basename(appBundle)}`)

  const runtimeSource = path.join(root, 'runtime', 'darwin')
  if (fs.existsSync(runtimeSource)) {
    fs.cpSync(runtimeSource, path.join(outputDirectory, 'runtime', 'darwin'), { recursive: true })
    console.log('Copied runtime/darwin')
  } else {
    console.warn('Warning: runtime/darwin not found - the app will show "Local AI runtime is unavailable".')
  }

  const runtimeLib = path.join(root, 'runtime', 'lib')
  if (fs.existsSync(runtimeLib)) {
    fs.cpSync(runtimeLib, path.join(outputDirectory, 'runtime', 'lib'), { recursive: true })
    console.log('Copied runtime/lib')
  }

  const modelsSource = path.join(root, 'models')
  fs.mkdirSync(path.join(outputDirectory, 'models'), { recursive: true })
  if (fs.existsSync(modelsSource)) {
    for (const entry of fs.readdirSync(modelsSource)) {
      if (!entry.endsWith('.gguf')) continue
      fs.cpSync(path.join(modelsSource, entry), path.join(outputDirectory, 'models', entry))
      console.log(`Copied model: ${entry}`)
    }
  }

  console.log(`\nUSB build ready at: ${outputDirectory}`)
  console.log('Copy everything inside usb-build/ to the root of your pendrive, then double-click the .app to run it.')
}

main()
