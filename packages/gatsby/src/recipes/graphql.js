const express = require(`express`)
const graphqlHTTP = require(`express-graphql`)
const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLEnumType,
  GraphQLInt,
  execute,
  subscribe,
} = require(`graphql`)
const { PubSub } = require(`graphql-subscriptions`)
const { SubscriptionServer } = require(`subscriptions-transport-ws`)
const { createServer } = require(`http`)
const Queue = require(`better-queue`)

const fileResource = require(`./providers/fs/file`)
const gatsbyPluginResource = require(`./providers/gatsby/plugin`)
const gatsbyShadowFileResource = require(`./providers/gatsby/shadow-file`)
const npmPackageResource = require(`./providers/npm/package`)
const npmPackageScriptResource = require(`./providers/npm/script`)

const SITE_ROOT = process.cwd()

const pubsub = new PubSub()
const PORT = 4000

let queue = new Queue(async (action, cb) => {
  console.log({ action })
  await applyStep(action)
  cb()
})

queue.pause()
queue.on(`task_finish`, () => {
  if (queue.length > 1) {
    queue.pause()
  }
})

const emitOperation = (state = `progress`, data, step = 0) => {
  pubsub.publish(`operation`, {
    state,
    step,
    data: JSON.stringify(data),
  })
}

const context = { root: SITE_ROOT }

const configResource = {
  create: () => {},
  read: () => {},
  update: () => {},
  destroy: () => {},
}

const componentResourceMapping = {
  File: fileResource,
  GatsbyPlugin: gatsbyPluginResource,
  ShadowFile: gatsbyShadowFileResource,
  Config: configResource,
  NPMPackage: npmPackageResource,
  NPMScript: npmPackageScriptResource,
}

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

const applyStep = async ({ plan, ...step }) => {
  const commandsForStep = Object.keys(step).map(async key => {
    const resource = componentResourceMapping[key]
    if (resource && resource.config && resource.config.batch) {
      console.log(`resource.create`, { context, step: step[key] })
      await resource.create(context, step[key])

      step[key].map((_, i) => {
        step[key][i].state = `complete`
      })
      emitOperation(`progress`, plan)
      return
    }

    // Run serially for now until we optimize the steps in an operation
    await asyncForEach(step[key], async (cmd, i) => {
      try {
        await resource.create(context, cmd)
        step[key][i].state = `complete`
        emitOperation(`progress`, plan)
      } catch (e) {
        step[key][i].state = `error`
        step[key][i].errorMessage = e.toString()
        emitOperation(`progress`, plan)
      }
    })
  })

  await Promise.all(commandsForStep)
}

const applyPlan = plan => {
  plan.forEach(step => queue.push({ plan, ...step }))

  queue.on(`drain`, () => {
    emitOperation(`success`, plan, plan.length - 1)
  })
}

const OperationStateEnumType = new GraphQLEnumType({
  name: `OperationStateEnum`,
  values: {
    RUNNING: { value: `progress` },
    SUCCESS: { value: `success` },
    ERROR: { value: `error` },
  },
})

const OperationType = new GraphQLObjectType({
  name: `Operation`,
  fields: {
    state: { type: OperationStateEnumType },
    step: { type: GraphQLInt },
    data: { type: GraphQLString },
  },
})

const rootQueryType = new GraphQLObjectType({
  name: `Root`,
  fields: () => {
    return {}
  },
})

const rootMutationType = new GraphQLObjectType({
  name: `Mutation`,
  fields: () => {
    return {
      createOperation: {
        type: GraphQLString,
        args: {
          commands: { type: GraphQLString },
        },
        resolve: (_data, args) => {
          applyPlan(JSON.parse(args.commands))
        },
      },
      applyOperationStep: {
        type: GraphQLString,
        resolve: () => {
          queue.resume()
        },
      },
    }
  },
})

const rootSubscriptionType = new GraphQLObjectType({
  name: `Subscription`,
  fields: () => {
    return {
      operation: {
        type: OperationType,
        subscribe: () => pubsub.asyncIterator(`operation`),
        resolve: payload => payload,
      },
    }
  },
})

const schema = new GraphQLSchema({
  query: rootQueryType,
  mutation: rootMutationType,
  subscription: rootSubscriptionType,
})

const app = express()
const server = createServer(app)

console.log(`listening on localhost:4000`)

app.use(
  `/graphql`,
  graphqlHTTP({
    schema,
    graphiql: true,
  })
)

server.listen(PORT, () => {
  new SubscriptionServer(
    {
      execute,
      subscribe,
      schema,
    },
    {
      server,
      path: `/graphql`,
    }
  )
})
