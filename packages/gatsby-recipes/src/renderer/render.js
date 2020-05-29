import React, { Suspense } from "react"
import Queue from "p-queue"

import resources from "../resources"

import RecipesReconciler from "./reconciler"
import ErrorBoundary from "./error-boundary"
import transformToPlan from "./transform-to-plan-structure"
import { ResourceProvider } from "./resource-provider"
import { useRecipeStep } from "./step-component"
import { InputProvider, useInputByUuid } from "./input-provider"

const queue = new Queue({ concurrency: 1, autoStart: false })

const errors = []
const cache = new Map()

const getInvalidProps = errors => {
  const invalidProps = errors.filter(e => {
    const details = e.details
    const unknownProp = details.find(e => e.type === `object.allowUnknown`)
    return unknownProp
  })
  return invalidProps
}

const getUserProps = props => {
  // eslint-disable-next-line
  const { mdxType, children, ...userProps } = props
  return userProps
}

const Wrapper = ({ children, inputs }) => (
  <ErrorBoundary>
    <InputProvider value={inputs}>
      <Suspense fallback={<p>Loading recipe...</p>}>{children}</Suspense>
    </InputProvider>
  </ErrorBoundary>
)

const ResourceComponent = ({
  _resourceName: Resource,
  _uuid,
  children,
  ...props
}) => {
  const step = useRecipeStep()
  const { data: inputProps } = useInputByUuid(_uuid)
  const userProps = getUserProps(props)
  const allProps = { ...props, ...inputProps }

  const resourceData = readResource(
    Resource,
    { root: process.cwd(), _uuid },
    allProps
  )

  return (
    <ResourceProvider data={{ [Resource]: resourceData }}>
      <Resource>
        {JSON.stringify({
          ...resourceData,
          _props: userProps,
          _stepMetadata: step,
          _uuid,
        })}
        {children}
      </Resource>
    </ResourceProvider>
  )
}

const validateResource = (resourceName, context, props) => {
  const userProps = getUserProps(props)
  const { error } = resources[resourceName].validate(userProps)
  if (error) {
    error.resourceUuid = context._uuid
  }
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

const render = async (recipe, cb, inputs = {}) => {
  const plan = {}

  const recipeWithWrapper = <Wrapper inputs={inputs}>{recipe}</Wrapper>

  const renderResources = async () => {
    queue.pause()

    RecipesReconciler.render(recipeWithWrapper, plan)

    if (errors.length) {
      const invalidProps = getInvalidProps(errors)

      if (invalidProps.length) {
        return cb({ type: `INVALID_PROPS`, data: invalidProps })
      }

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
