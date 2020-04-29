const { createClient } = require(`contentful-management`)
const Joi = require(`@hapi/joi`)

const resourceSchema = require(`../resource-schema`)

const client = createClient({
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
})

/*
# Contentful blog setup

---

Create a new space

<ContentfulSpace name="blog" />

---

Create the BlogPost type.

<ContentfulType
  spaceName="blog"
  schema={`
    type BlogPost {
      title: String!
      date: Date!
      body: String!
    }
  `}
/>

---

Create a demo post!

<ContentfulContent
  name="BlogPost"
  data={{
    title: 'Hello, world!'
    date: '2020-20-20'
    body: '# Yay!'
  }}
/>

---

Local plugin to source the contentful blog posts to create pages

<File content="foo" />
<GatsbyPlugin name="./foo" />
*/

const create = async (_context, { name }) => {
  const space = await client.createSpace({ name })

  return {
    name: space.name,
    id: space.sys.id,
    _message: message(space),
  }
}

const read = async (_context, name) => {
  const spaces = all()
  const space = spaces.find(s => s.name === name)

  return {
    ...space,
    id: space.sys.id,
  }
}

const destroy = async (_context, id) => {
  const space = await client.getSpace(id)

  console.log(space)

  const spaceResource = {
    name: space.name,
    id: space.sys.id,
  }

  await space.delete()

  return spaceResource
}

const all = async () => {
  const spaces = client.getSpaces()

  return spaces
}

const schema = {
  name: Joi.string(),
  ...resourceSchema,
}

const validate = resource =>
  Joi.validate(resource, schema, { abortEarly: false })

const plan = async (context, { id, name }) => {
  const currentResource = await read(context, id || name)

  if (!currentResource) {
    return {
      currentState: ``,
      describe: `Create Contentful space ${name}`,
      diffExists: true,
      skipDiff: true,
    }
  } else {
    return {
      currentState: currentResource,
      describe: `Contentful space ${name} already exists`,
      diff: ``,
    }
  }
}

const message = resource => `Created Contentful space ${resource.name}`

module.exports.schema = schema
module.exports.validate = validate
module.exports.plan = plan
module.exports.create = create
module.exports.read = read
module.exports.update = create
module.exports.destroy = destroy
module.exports.all = all
