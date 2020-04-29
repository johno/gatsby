const { makeExecutableSchema } = require(`graphql-tools`)

const gqlFieldsToObject = fields =>
  Object.entries(fields).reduce((acc, [key, value]) => {
    acc[key] = value.type
    return acc
  }, {})

// TODO: Support relations/collections for mapping schema to CMS
//       content models for providers.
module.exports = typeDefs => {
  const { _typeMap: typeMap } = makeExecutableSchema({ typeDefs })

  return Object.entries(typeMap)
    .filter(([key, value]) => {
      if (key.startsWith(`_`) || !value._fields) {
        return false
      }

      return true
    })
    .map(([key, value]) => {
      return {
        name: key,
        fields: gqlFieldsToObject(value._fields),
      }
    })
}
