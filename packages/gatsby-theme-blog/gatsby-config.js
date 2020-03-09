module.exports = options => {
  const { useThemeUI = true } = options

  const plugins = [
    {
      resolve: `gatsby-theme-blog-core`,
      options,
    },
    `gatsby-plugin-react-helmet`,
    `gatsby-plugin-twitter`
  ]

  if (useThemeUI) {
    plugins.push(`gatsby-plugin-theme-ui`)
    plugins.push(`gatsby-plugin-emotion`)
  }

  return {
    plugins
  }
}
