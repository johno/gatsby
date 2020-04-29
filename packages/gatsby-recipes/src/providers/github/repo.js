const { graphql } = require(`@octokit/graphql`)
const Joi = require(`@hapi/joi`)
const fetch = require(`node-fetch`)

const resourceSchema = require(`../resource-schema`)

const client = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_API_TOKEN}`,
  },
})

const create = async (_context, { name, visibility }) => {
  const repo = await client(
    `
    mutation($name: String!, $visibility: RepositoryVisibility!) {
      createRepository(input: { name: $name, visibility: $visibility }) {
        repository {
          name
          url
        }
      }
    }
  `,
    {
      name,
      visibility,
    }
  )

  return {
    ...repo,
    id: name,
    _message: message(repo),
  }
}

const read = async (_context, id) => {
  const [owner, name] = id.split(`/`)
  const { repository } = await client(
    `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        name
        nameWithOwner
        description
      }
    }
  `,
    {
      name,
      owner,
    }
  )

  return {
    ...repository,
    id,
  }
}

const destroy = async (context, id) => {
  const repo = await read(context, id)

  // The GraphQL API for GitHub doesn't appear to support deleting repos
  // so we will use the REST API instead.
  const res = await fetch(`https://api.github.com/repos/${id}`, {
    method: `DELETE`,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}`,
    },
  })

  console.log(res.status)

  return repo
}

const schema = {
  name: Joi.string(),
  owner: Joi.string(),
  visibility: Joi.string(), // INTERNAL, PRIVATE, PUBLIC
  ...resourceSchema,
}

const validate = resource => {
  if (!process.env.GITHUB_API_TOKEN) {
    return {
      error: `You must set  GITHUB_API_TOKEN=123 in your .env file to use the GitHub resource`,
    }
  }

  return Joi.validate(resource, schema, { abortEarly: false })
}

const plan = async (context, { id, name }) => {
  const currentResource = await read(context, id || name)

  if (!currentResource) {
    return {
      currentState: ``,
      describe: `Create GitHub repository ${name}`,
      diffExists: true,
      skipDiff: true,
    }
  } else {
    return {
      currentState: currentResource,
      describe: `GitHub repository ${name} already exists`,
      diff: ``,
    }
  }
}

const message = resource => `Created GitHub repository ${resource.name}`

module.exports.schema = schema
module.exports.validate = validate
module.exports.plan = plan
module.exports.create = create
module.exports.read = read
module.exports.update = create
module.exports.destroy = destroy
