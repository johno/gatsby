const t = require(`@babel/types`)
const template = require(`@babel/template`).default

module.exports = (pluginName, options) => {
  if (!options) {
    return t.stringLiteral(pluginName)
  }

  const pluginWithOptions = template(`
    const foo = {
      resolve: '${pluginName}',
      options: ${JSON.stringify(options, null, 2)}
    }
  `)()

  return pluginWithOptions.declarations[0].init
}
