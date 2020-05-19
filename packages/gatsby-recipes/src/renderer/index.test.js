const render = require(`.`)

const mdxFixture = `
# Hello, world!

<File path="foo.js" content="/** foo */" />
<File path="foo2.js" content="/** foo2 */" />
<NPMPackage name="gatsby" />
`

describe(`renderer`, () => {
  test(`handles MDX as input`, async () => {
    const result = await render(mdxFixture)

    expect(result).toMatchInlineSnapshot(`
      Array [
        Object {
          "currentState": "",
          "describe": "Write foo.js",
          "diff": "- Original  - 0
      + Modified  + 1

      + /** foo */",
          "newState": "/** foo */",
          "resourceDefinitions": Object {
            "content": "/** foo */",
            "path": "foo.js",
          },
          "resourceName": "File",
        },
        Object {
          "currentState": "",
          "describe": "Write foo2.js",
          "diff": "- Original  - 0
      + Modified  + 1

      + /** foo2 */",
          "newState": "/** foo2 */",
          "resourceDefinitions": Object {
            "content": "/** foo2 */",
            "path": "foo2.js",
          },
          "resourceName": "File",
        },
        Object {
          "currentState": "gatsby@2.21.28",
          "describe": "Install gatsby@latest",
          "newState": "gatsby@latest",
          "resourceDefinitions": Object {
            "name": "gatsby",
          },
          "resourceName": "NPMPackage",
        },
      ]
    `)
  })

  test(`handles JSX with a single component`, async () => {
    const result = await render(`<File path="hi.md" content="hi" />`)

    expect(result).toMatchInlineSnapshot(`
      Array [
        Object {
          "currentState": "",
          "describe": "Write hi.md",
          "diff": "- Original  - 0
      + Modified  + 1

      + hi",
          "newState": "hi",
          "resourceDefinitions": Object {
            "content": "hi",
            "path": "hi.md",
          },
          "resourceName": "File",
        },
      ]
    `)
  })

  test(`returns a plan for nested JSX`, async () => {
    const result = await render(`<div>
  <File path="foo.js" content="/** foo */" />
</div>
    `)

    expect(result).toMatchInlineSnapshot(`
      Array [
        Object {
          "currentState": "",
          "describe": "Write foo.js",
          "diff": "- Original  - 0
      + Modified  + 1

      + /** foo */",
          "newState": "/** foo */",
          "resourceDefinitions": Object {
            "content": "/** foo */",
            "path": "foo.js",
          },
          "resourceName": "File",
        },
      ]
    `)
  })
})
