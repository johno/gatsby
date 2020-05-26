const { resourceSchema, Joi } = require(`recipes-resource`)

const client = require(`./client`)
const space = require(`./space`)

const create = async (context, { name }) => {
  const spaceId = context.ContentfulSpace.id

  const space = await space.read(context, spaceId)
  const environment = space.createEnvironment(name)

  return {
    name: environment.name,
    id: environment.sys.id,
    _message: message(environment),
  }
}

const read = async (_context, name) => {
  const spaceId = context.ContentfulSpace.id
  const space = await space.read(context, spaceId)

  const environment = space.getEnvironments.find(s => s.name === name)

  return {
    ...environment,
    id: environment.sys.id,
  }
}

const destroy = async (_context, id) => {}

const all = async () => {}

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
      describe: `Create Contentful environment ${name}`,
      diffExists: true,
      skipDiff: true,
    }
  } else {
    return {
      currentState: currentResource,
      describe: `Contentful environment ${name} already exists`,
      diff: ``,
    }
  }
}

const message = resource => `Created Contentful environment ${resource.name}`

module.exports.schema = schema
module.exports.validate = validate
module.exports.plan = plan
module.exports.create = create
module.exports.read = read
module.exports.update = create
module.exports.destroy = destroy
module.exports.all = all
