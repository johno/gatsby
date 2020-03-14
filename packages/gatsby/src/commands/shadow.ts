import fs from 'fs'
import path from 'path'
import { Reporter } from 'gatsby'
import { sync as globSync } from 'glob'

import { IProgram } from "./types"

// This is because we splat command line arguments onto this object.
// A good refactor would be to put this inside a key like `cliArgs`
interface IShadowProgram extends IProgram {
  list?: string
  debug?: boolean
}

function debugShadowing(directory: string, report: Reporter) {
  report.info('Debugging shadowing in ' + directory)
}

function listShadowableFilesForTheme(directory: string, report: Reporter, theme: string) {
  const fullThemePath = path.join(directory, 'node_modules', theme, 'src')
  const shadowableThemeFiles = globSync(fullThemePath + '/**/*.*', { follow: true })

  function toShadowPath (filePath: string): string {
    const themePath = filePath.replace(fullThemePath, '')
    return path.join('src', theme, themePath)
  }

  const shadowPaths = shadowableThemeFiles.map(toShadowPath)

  const shadowedFiles = shadowPaths.filter(fileExists)
  const shadowableFiles = shadowPaths.filter(filePath => !fileExists(filePath))

  if (shadowedFiles.length) {
    report.info(`Shadowed files:\n  ${shadowedFiles.join('\n  ')}`)
  }

  report.info(`Shadowable files:\n  ${shadowableFiles.join('\n  ')}`)
}

module.exports = async function clean(program: IShadowProgram): Promise<void> {
  const { directory, report, debug, list } = program

  if (debug) {
    return debugShadowing(directory, report)
  }

  if (list) {
    return listShadowableFilesForTheme(directory, report, list)
  }
}

function fileExists (filePath: string): boolean {
  return fs.existsSync(filePath)
}
