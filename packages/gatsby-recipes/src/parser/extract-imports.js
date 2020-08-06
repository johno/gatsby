import babel from '@babel/standalone'

import BabelPluginExtractImportNames from '../babel-plugins/extract-import-names'

function extractImports (src) {
  try {
    const plugin = new BabelPluginExtractImportNames()
    babel.transform(src, {
      configFile: false,
      plugins: [plugin.plugin],
    })
    return plugin.state
  } catch (e) {
    console.log(e)
    return {}
  }
}

export default extractImports
