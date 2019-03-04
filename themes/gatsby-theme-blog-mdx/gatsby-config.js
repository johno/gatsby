const path = require('path')

module.exports = ({ defaultLayouts = {} } = {}) => {
  const themeLayouts = {
    posts: require.resolve('./src/templates/post'),
    default: require.resolve('./src/components/layout')
  }

  return {
    siteMetadata: {
      title: 'Gatsby MDX Blog',
      siteUrl: 'https://gatsbyjs.org'
    },
    mapping: {
      'Mdx.frontmatter.author': 'AuthorYaml'
    },
    plugins: [
      {
        resolve: 'gatsby-mdx',
        options: {
          defaultLayouts: {
            ...themeLayouts,
            ...defaultLayouts
          }
        }
      },
      {
        resolve: 'gatsby-source-filesystem',
        options: {
          path: 'posts',
          name: 'posts'
        }
      },
      {
        resolve: 'gatsby-source-filesystem',
        options: {
          path: path.join(__dirname, 'posts')
        }
      },
      {
        // This will eventually be default
        resolve: 'gatsby-plugin-page-creator',
        options: {
          path: path.join(__dirname, 'src', 'pages')
        }
      },
      {
        resolve: 'gatsby-source-filesystem',
        options: {
          name: 'data',
          path: 'data',
          ignore: ['**/\.*']
        },
      },
      'gatsby-transformer-yaml',
      'gatsby-plugin-meta-redirect'
    ]
  }
}
