const { createClient } = require(`contentful-management`)

const client = createClient({
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
})

module.exports = client
