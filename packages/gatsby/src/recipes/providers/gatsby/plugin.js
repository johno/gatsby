const fs = require(`fs-extra`)
const path = require(`path`)
const babel = require(`@babel/core`)
const generate = require(`@babel/generator`).default
const t = require(`@babel/types`)
const Joi = require(`@hapi/joi`)

const declare = require(`@babel/helper-plugin-utils`).declare

const unwrapTemplateLiterals = str =>
  str
    .trim()
    .replace(/^`/, ``)
    .replace(/`$/, ``)

const getElementProps = ({ value: v }) => {
  const props = v.properties.reduce((acc, curr) => {
    let value = null

    if (curr.value) {
      value = getValueFromLiteral(curr)
    } else if (t.isObjectExpression(curr.value)) {
      value = curr.value.expression.properties.reduce((acc, curr) => {
        acc[curr.key.name] = getElementProps(curr)
        return acc
      }, {})
    } else {
      throw new Error(`Did not recognize ${curr}`)
    }

    if (value === null) {
      console.log(v)
    }
    acc[curr.key.name] = value
    return acc
  }, {})

  return props
}

const isDefaultExport = node => {
  if (!node || node.type !== `MemberExpression`) {
    return false
  }

  const { object, property } = node

  if (object.type !== `Identifier` || object.name !== `module`) return false
  if (property.type !== `Identifier` || property.name !== `exports`)
    return false

  return true
}

const getValueFromLiteral = node => {
  if (node.type === `StringLiteral`) {
    return node.value
  }

  if (node.type === `TemplateLiteral`) {
    // Handle comments before literals that can get gobbled up in the
    // code generator to make serialization simpler.
    delete node.leadingComments
    return generate(node).code
  }

  return null
}

const getNameForPlugin = node => {
  if (node.type === `StringLiteral` || node.type === `TemplateLiteral`) {
    return getValueFromLiteral(node)
  }

  if (node.type === `ObjectExpression`) {
    const resolve = node.properties.find(p => p.key.name === `resolve`)
    return resolve ? getValueFromLiteral(resolve.value) : null
  }

  return null
}

const getOptionsForPlugin = node => {
  if (node.type !== `ObjectExpression`) {
    return {}
  }

  return getElementProps(
    node.properties.find(property => property.key.name === `options`)
  )
}

const getPlugin = node => {
  return {
    name: getNameForPlugin(node),
    options: getOptionsForPlugin(node),
  }
}

const addPluginToConfig = (src, pluginName) => {
  const addPlugins = new BabelPluginAddPluginsToGatsbyConfig({
    pluginOrThemeName: pluginName,
    shouldAdd: true,
  })

  const { code } = babel.transform(src, {
    plugins: [addPlugins.plugin],
  })

  return code
}

const getPluginsFromConfig = src => {
  const getPlugins = new BabelPluginGetPluginsFromGatsbyConfig()

  babel.transform(src, {
    plugins: [getPlugins.plugin],
  })

  return getPlugins.state
}

const create = async ({ root }, { name }) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const configSrc = await fs.readFile(configPath, `utf8`)

  const code = addPluginToConfig(configSrc, name)

  await fs.writeFile(configPath, code)

  return await read({ root }, name)
}

const read = async ({ root }, id) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const configSrc = await fs.readFile(configPath, `utf8`)

  const plugin = getPluginsFromConfig(configSrc).find(
    plugin => plugin.name === id
  )

  if (plugin) {
    return { ...plugin, id: plugin.name }
  } else {
    return undefined
  }
}

const destroy = async ({ root }, { name }) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const configSrc = await fs.readFile(configPath, `utf8`)

  const addPlugins = new BabelPluginAddPluginsToGatsbyConfig({
    pluginOrThemeName: name,
    shouldAdd: false,
  })

  const { code } = babel.transform(configSrc, {
    plugins: [addPlugins.plugin],
  })

  await fs.writeFile(configPath, code)
}

class BabelPluginAddPluginsToGatsbyConfig {
  constructor({ pluginOrThemeName, shouldAdd }) {
    this.plugin = declare(api => {
      api.assertVersion(7)

      const { types: t } = api
      return {
        visitor: {
          ExpressionStatement(path) {
            const { node } = path
            const { left, right } = node.expression

            if (!isDefaultExport(left)) {
              return
            }

            const plugins = right.properties.find(p => p.key.name === `plugins`)

            if (shouldAdd) {
              const pluginNames = plugins.value.elements.map(getNameForPlugin)
              const exists = pluginNames.includes(pluginOrThemeName)
              if (!exists) {
                plugins.value.elements.push(t.stringLiteral(pluginOrThemeName))
              }
            } else {
              plugins.value.elements = plugins.value.elements.filter(
                node => getNameForPlugin(node) !== pluginOrThemeName
              )
            }

            path.stop()
          },
        },
      }
    })
  }
}

class BabelPluginGetPluginsFromGatsbyConfig {
  constructor() {
    this.state = []

    this.plugin = declare(api => {
      api.assertVersion(7)

      return {
        visitor: {
          ExpressionStatement: path => {
            const { node } = path
            const { left, right } = node.expression

            if (!isDefaultExport(left)) {
              return
            }

            const plugins = right.properties.find(p => p.key.name === `plugins`)

            plugins.value.elements.map(node => {
              this.state.push(getPlugin(node))
            })
          },
        },
      }
    })
  }
}

module.exports.addPluginToConfig = addPluginToConfig
module.exports.getPluginsFromConfig = getPluginsFromConfig

module.exports.create = create
module.exports.update = create
module.exports.read = read
module.exports.destroy = destroy

module.exports.all = async ({ root }) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const src = await fs.readFile(configPath, `utf8`)
  const plugins = getPluginsFromConfig(src)

  // TODO: Consider mapping to read function
  return plugins.map(plugin => {
    return {
      ...plugin,
      id: plugin.name,
    }
  })
}

module.exports.validate = () => {
  return {
    name: Joi.string(),
    options: Joi.object(),
  }
}

module.exports.plan = async ({ root }, { id, name }) => {
  const fullName = id || name
  const configPath = path.join(root, `gatsby-config.js`)
  const src = await fs.readFile(configPath, `utf8`)
  const newContents = addPluginToConfig(src, fullName)

  return {
    id: fullName,
    name,
    currentState: src,
    newState: newContents,
    describe: `Configure ${fullName}`,
  }
}
