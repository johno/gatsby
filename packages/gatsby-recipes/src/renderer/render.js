import React, { Suspense } from "react"
import Queue from "p-queue"

import resources from "../resources"

import RecipesReconciler from "./reconciler"
import ErrorBoundary from "./error-boundary"
import transformToPlan from "./transform-to-plan-structure"
import { ResourceProvider } from "./resource-provider"

const queue = new Queue({ concurrency: 1, autoStart: false })

const errors = []
const cache = new Map()

const getUserProps = props => {
  // eslint-disable-next-line
  const { mdxType, children, ...userProps } = props
  return userProps
}

const Wrapper = ({ children }) => (
  <ErrorBoundary>
    <Suspense fallback={<p>Loading recipe...</p>}>{children}</Suspense>
  </ErrorBoundary>
)

const ResourceComponent = ({ _resourceName: Resource, children, ...props }) => {
  const userProps = getUserProps(props)
  const resourceData = readResource(Resource, { root: process.cwd() }, props)

  return (
    <ResourceProvider data={{ [Resource]: resourceData }}>
      <Resource>
        {JSON.stringify({ ...resourceData, _props: userProps })}
        {children}
      </Resource>
    </ResourceProvider>
  )
}

const validateResource = (resourceName, _context, props) => {
  const userProps = getUserProps(props)
  const { error } = resources[resourceName].validate(userProps)
  return error
}

const readResource = (resourceName, context, props) => {
  const error = validateResource(resourceName, context, props)
  if (error) {
    errors.push(error)
    return null
  }

  const key = JSON.stringify({ resourceName, ...props })
  const cachedResult = cache.get(key)

  if (cachedResult) {
    return cachedResult
  }

  let promise
  try {
    promise = resources[resourceName]
      .plan(context, props)
      .then(result => cache.set(key, result))
      .catch(e => {
        console.log(e)
        throw e
      })
  } catch (e) {
    throw e
  }

  queue.add(() => promise)

  throw promise
}

const render = async (recipe, cb) => {
  const plan = {}

  const recipeWithWrapper = <Wrapper>{recipe}</Wrapper>

  const renderResources = async () => {
    queue.pause()

    RecipesReconciler.render(recipeWithWrapper, plan)

    if (errors.length) {
      return cb({ type: `INPUT`, data: errors })
    }

    // If there aren't any new resources that need to be fetched, or errors, we're done!
    if (!queue.size && !errors.length) {
      return undefined
    }

    queue.start()
    await queue.onIdle()
    return await renderResources()
  }

  try {
    // Begin the "render loop" until there are no more resources being queued.
    await renderResources()

    if (errors.length) {
      // We found errors that were emitted back to the state machine, so
      // we don't need to re-render
      return null
    }

    // Rerender with the resources and resolve the data from the cache
    const result = RecipesReconciler.render(recipeWithWrapper, plan)
    return transformToPlan(result)
  } catch (e) {
    throw e
  }
}

module.exports.render = render
module.exports.ResourceComponent = ResourceComponent
