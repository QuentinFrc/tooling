import fs from 'node:fs'
import path from 'node:path'

export function copyEnvFiles(from: string, to: string, files: string[]): string[] {
  const copied: string[] = []

  for (const file of files) {
    const srcPath = path.join(from, file)
    if (!fs.existsSync(srcPath)) continue

    const destPath = path.join(to, file)
    if (fs.existsSync(destPath)) continue

    fs.copyFileSync(srcPath, destPath)
    copied.push(file)
  }

  return copied
}
