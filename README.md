# PORTABLE.AI

PORTABLE.AI is a Windows USB-ready local desktop application shell built with Electron + React + TypeScript + Vite.

## Run locally

```bash
npm install
npm run dev
```

## Build for portable app

```bash
npm run dist
```

This creates the Windows portable executable in the release folder.

## Prepare USB copy

```bash
npm run usb:prepare
```

This creates a portable-usb folder with the executable and required local folders:

- runtime/
- models/
- data/
- logs/

## Launch behavior

The app is designed to run as a normal desktop app and is intended to be launched by double-clicking the portable executable on Windows.

It does not install services, registry entries, or startup persistence.
