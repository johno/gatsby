const fs = require(`fs-extra`)
const path = require(`path`)
const babel = require(`@babel/core`)
const t = require(`@babel/types`)
const declare = require(`@babel/helper-plugin-utils`).declare
const Joi = require(`@hapi/joi`)
const glob = require(`glob`)
const prettier = require(`prettier`)

const getDiff = require(`../utils/get-diff`)
const resourceSchema = require(`../resource-schema`)

const isDefaultExport = require(`./utils/is-default-export`)
const buildPluginNode = require(`./utils/build-plugin-node`)
const getObjectFromNode = require(`./utils/get-object-from-node`)
const { getValueFromNode } = require(`./utils/get-object-from-node`)

const fileExists = filePath => fs.existsSync(filePath)

const listShadowableFilesForTheme = (directory, theme) => {
  const fullThemePath = path.join(directory, `node_modules`, theme, `src`)
  const shadowableThemeFiles = glob.sync(fullThemePath + `/**/*.*`, {
    follow: true,
  })

  const toShadowPath = filePath => {
    const themePath = filePath.replace(fullThemePath, ``)
    return path.join(`src`, theme, themePath)
  }

  const shadowPaths = shadowableThemeFiles.map(toShadowPath)

  const shadowedFiles = shadowPaths.filter(fileExists)
  const shadowableFiles = shadowPaths.filter(filePath => !fileExists(filePath))

  return { shadowedFiles, shadowableFiles }
}

const getOptionsForPlugin = node => {
  if (!t.isObjectExpression(node)) {
    return undefined
  }

  const options = node.properties.find(
    property => property.key.name === `options`
  )

  if (options) {
    return getObjectFromNode(options.value)
  }

  return undefined
}

const getPlugin = node => {
  return {
    name: getNameForPlugin(node),
    options: getOptionsForPlugin(node),
  }
}

const getNameForPlugin = node => {
  if (t.isStringLiteral(node) || t.isTemplateLiteral(node)) {
    return getValueFromNode(node)
  }

  if (t.isObjectExpression(node)) {
    const resolve = node.properties.find(p => p.key.name === `resolve`)
    return resolve ? getValueFromNode(resolve.value) : null
  }

  return null
}

const addPluginToConfig = (src, pluginName, options) => {
  const addPlugins = new BabelPluginAddPluginsToGatsbyConfig({
    pluginOrThemeName: pluginName,
    options,
    shouldAdd: true,
  })

  const { code } = babel.transform(src, {
    plugins: [addPlugins.plugin],
    configFile: false,
  })

  return code
}

const getPluginsFromConfig = src => {
  const getPlugins = new BabelPluginGetPluginsFromGatsbyConfig()

  babel.transform(src, {
    plugins: [getPlugins.plugin],
    configFile: false,
  })

  return getPlugins.state
}

const create = async ({ root }, { name, options }) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const configSrc = await fs.readFile(configPath, `utf8`)

  const prettierConfig = await prettier.resolveConfig(root)

  let code = addPluginToConfig(configSrc, name, options)
  code = prettier.format(code, { ...prettierConfig, parser: `babel` })

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
    return { id, ...plugin, _message: `Installed ${id} in gatsby-config.js` }
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
    configFile: false,
  })

  await fs.writeFile(configPath, code)
}

class BabelPluginAddPluginsToGatsbyConfig {
  constructor({ pluginOrThemeName, shouldAdd, options }) {
    this.plugin = declare(api => {
      api.assertVersion(7)

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
                const pluginNode = buildPluginNode(pluginOrThemeName, options)
                plugins.value.elements.push(pluginNode)
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
module.exports.config = {}

module.exports.all = async ({ root }) => {
  const configPath = path.join(root, `gatsby-config.js`)
  const src = await fs.readFile(configPath, `utf8`)
  const plugins = getPluginsFromConfig(src)

  // TODO: Consider mapping to read function
  return plugins.map(name => {
    const { shadowedFiles, shadowableFiles } = listShadowableFilesForTheme(
      root,
      name
    )

    return {
      id: name,
      name,
      shadowedFiles,
      shadowableFiles,
    }
  })
}

const schema = {
  name: Joi.string(),
  options: Joi.object(),
  shadowableFiles: Joi.array().items(Joi.string()),
  shadowedFiles: Joi.array().items(Joi.string()),
  ...resourceSchema,
}

const validate = resource =>
  Joi.validate(resource, schema, { abortEarly: false })

exports.schema = schema
exports.validate = validate

module.exports.plan = async ({ root }, { id, name, options }) => {
  const fullName = id || name
  const configPath = path.join(root, `gatsby-config.js`)
  const prettierConfig = await prettier.resolveConfig(root)
  let src = await fs.readFile(configPath, `utf8`)
  src = prettier.format(src, {
    ...prettierConfig,
    parser: `babel`,
  })
  let newContents = addPluginToConfig(src, fullName, options)
  newContents = prettier.format(newContents, {
    ...prettierConfig,
    parser: `babel`,
  })
  const diff = await getDiff(src, newContents)

  return {
    id: fullName,
    name,
    diff,
    currentState: src,
    newState: newContents,
    describe: `Install ${fullName} in gatsby-config.js`,
  }
}
