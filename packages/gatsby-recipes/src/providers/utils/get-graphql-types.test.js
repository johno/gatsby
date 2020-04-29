const getTypes = require(`./get-graphql-types`)

test(`get-graphql-types returns an array of types`, () => {
  const result = getTypes(`
    type BlogPost {
      title: String
      body: String
    }
  `)

  expect(result).toMatchInlineSnapshot(`
    Array [
      Object {
        "fields": Object {
          "body": "String",
          "title": "String",
        },
        "name": "BlogPost",
      },
    ]
  `)
})
