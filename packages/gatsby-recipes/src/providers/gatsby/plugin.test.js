const fs = require(`fs-extra`)
const path = require(`path`)

const plugin = require(`./plugin`)
const { addPluginToConfig, getPluginsFromConfig } = require(`./plugin`)
const resourceTestHelper = require(`../resource-test-helper`)

const root = path.join(__dirname, `./fixtures/gatsby-starter-blog`)
const helloWorldRoot = path.join(
  __dirname,
  `./fixtures/gatsby-starter-hello-world`
)
const name = `gatsby-plugin-foo`
const configPath = path.join(root, `gatsby-config.js`)

describe(`gatsby-plugin resource`, () => {
  test(`e2e plugin resource test`, async () => {
    await resourceTestHelper({
      resourceModule: plugin,
      resourceName: `GatsbyPlugin`,
      context: { root },
      initialObject: { id: name, name },
      partialUpdate: { id: name },
    })
  })

  test(`e2e plugin resource test with hello world starter`, async () => {
    await resourceTestHelper({
      resourceModule: plugin,
      resourceName: `GatsbyPlugin`,
      context: { root: helloWorldRoot },
      initialObject: { id: name, name },
      partialUpdate: { id: name },
    })
  })

  test(`does not add the same plugin twice by default`, async () => {
    const configSrc = await fs.readFile(configPath, `utf8`)
    const newConfigSrc = addPluginToConfig(
      configSrc,
      `gatsby-plugin-react-helmet`
    )
    const plugins = getPluginsFromConfig(newConfigSrc)

    const result = [...new Set(plugins)]

    expect(result).toEqual(plugins)
  })

  // A key isn't required for gatsby plugin, but when you want to distinguish
  // between multiple of the same plugin, you can specify it to target config changes.
  test(`validates the gatsby-source-filesystem specifies a key`, async () => {
    const result = plugin.validate({ name: `gatsby-source-filesystem` })

    expect(result.error).toEqual(
      `gatsby-source-filesystem requires a key to be set`
    )
  })

  test(`adds multiple gatsby-source-filesystems and reads with key`, async () => {
    const context = { root: helloWorldRoot }
    const fooPlugin = {
      key: `foo-data-sourcing`,
      name: `gatsby-source-filesystem`,
      options: {
        name: `foo`,
        path: `foo`,
      },
    }
    const barPlugin = {
      key: `bar-data-sourcing`,
      name: `gatsby-source-filesystem`,
      options: {
        name: `bar`,
        path: `bar`,
      },
    }

    await plugin.create(context, fooPlugin)
    await plugin.create(context, barPlugin)

    const barResult = await plugin.read(context, barPlugin.key)
    const fooResult = await plugin.read(context, fooPlugin.key)

    expect(barResult.key).toEqual(barPlugin.key)
    expect(fooResult.key).toEqual(fooPlugin.key)
    expect(barResult.options.name).toEqual(barPlugin.options.name)
    expect(fooResult.options.name).toEqual(fooPlugin.options.name)

    const newBarResult = await plugin.update(context, {
      ...barResult,
      options: { path: `new-bar` },
    })

    expect(newBarResult.key).toEqual(barPlugin.key)
    expect(newBarResult.options).toEqual({ path: `new-bar` })

    await plugin.destroy(context, barResult)
    await plugin.destroy(context, fooResult)
  })

  test(`handles config options as an object`, async () => {
    const configSrc = await fs.readFile(configPath, `utf8`)
    const newConfigSrc = addPluginToConfig(configSrc, `gatsby-plugin-foo`, {
      foo: 1,
      bar: `baz`,
      baz: `qux`,
      otherStuff: [
        {
          foo: `bar2`,
          bar: [{ foo: `bar` }],
        },
      ],
    })

    const result = getPluginsFromConfig(newConfigSrc)

    expect(result).toMatchSnapshot()
  })
})
