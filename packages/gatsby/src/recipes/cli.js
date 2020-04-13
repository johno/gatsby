import fs from "fs"
import lodash from "lodash"
import React, { useState } from "react"
import { render, Box, Text, Color, useInput, useApp, Static } from "ink"
import Spinner from "ink-spinner"
import Link from "ink-link"
import MDX from "@mdx-js/runtime"
import {
  createClient,
  useMutation,
  useSubscription,
  Provider,
  defaultExchanges,
  subscriptionExchange,
} from "urql"
import { SubscriptionClient } from "subscriptions-transport-ws"
import fetch from "node-fetch"
import ws from "ws"

let renderCount = 1

const Div = props => (
  <Box
    width="100%"
    textWrap="wrap"
    flexShrink={0}
    flexDirection="column"
    {...props}
  />
)

// Markdown ignores new lines and so do we.
function elimiateNewLines(children) {
  return React.Children.map(children, child => {
    if (!React.isValidElement(child)) {
      return child.replace(/(\r\n|\n|\r)/gm, ` `)
    }

    if (child.props.children) {
      child = React.cloneElement(child, {
        children: elimiateNewLines(child.props.children),
      })
    }

    return child
  })
}

const components = {
  inlineCode: props => <Text {...props} />,
  h1: props => (
    <Div marginBottom={1}>
      <Text bold underline {...props} />
    </Div>
  ),
  h2: props => <Text bold {...props} />,
  h3: props => <Text bold italic {...props} />,
  h4: props => <Text bold {...props} />,
  h5: props => <Text bold {...props} />,
  h6: props => <Text bold {...props} />,
  a: ({ href, children }) => <Link url={href}>{children}</Link>,
  br: () => null,
  strong: props => <Text bold {...props} />,
  em: props => <Text italic {...props} />,
  p: props => {
    let children = elimiateNewLines(props.children)
    return (
      <Box
        width="100%"
        marginBottom={1}
        flexDirection="row"
        textWrap="wrap"
        {...props}
        children={children}
      />
    )
  },
  ul: props => <Div marginBottom={1}>{props.children}</Div>,
  li: props => <Text>* {props.children}</Text>,
  Config: () => null,
  GatsbyPlugin: () => null,
  NPMPackageJson: () => null,
  NPMPackage: () => null,
  File: () => null,
  ShadowFile: () => null,
  NPMScript: () => null,
}

var logStream = fs.createWriteStream(`recipe-client.log`, { flags: `a` })
const log = (label, textOrObj) => {
  logStream.write(`[${label}]:\n`)
  logStream.write(require(`util`).inspect(textOrObj))
  logStream.write(`\n`)
}

log(
  `started client`,
  `======================================= ${new Date().toJSON()}`
)

const PlanContext = React.createContext({})

export default ({ recipe, projectRoot }) => {
  const GRAPHQL_ENDPOINT = `http://localhost:4000/graphql`

  const subscriptionClient = new SubscriptionClient(
    `ws://localhost:4000/graphql`,
    {
      reconnect: true,
    },
    ws
  )

  const client = createClient({
    fetch,
    url: GRAPHQL_ENDPOINT,
    exchanges: [
      ...defaultExchanges,
      subscriptionExchange({
        forwardSubscription(operation) {
          return subscriptionClient.request(operation)
        },
      }),
    ],
  })

  const RecipeInterpreter = () => {
    const [lastKeyPress, setLastKeyPress] = useState(``)
    const { exit } = useApp()

    const [subscriptionResponse] = useSubscription(
      {
        query: `
        subscription {
          operation {
            state
          }
        }
      `,
      },
      (_prev, now) => now
    )
    const [_, createOperation] = useMutation(`
      mutation ($recipePath: String!, $projectRoot: String!) {
        createOperation(recipePath: $recipePath, projectRoot: $projectRoot)
      }
    `)
    const [__, sendEvent] = useMutation(`
      mutation($event: String!) {
        sendEvent(event: $event)
      }
    `)

    subscriptionClient.connectionCallback = async () => {
      try {
        await createOperation({ recipePath: recipe, projectRoot })
      } catch (e) {
        log(`error creating operation`, e)
      }
    }

    const state =
      subscriptionResponse.data &&
      JSON.parse(subscriptionResponse.data.operation.state)

    useInput((_, key) => {
      setLastKeyPress(key)
      if (key.return && state.value === `SUCCESS`) {
        subscriptionClient.close()
        exit()
        process.exit()
      } else if (key.return) {
        sendEvent({ event: `CONTINUE` })
      }
    })

    log(`subscriptionResponse.data`, subscriptionResponse.data)

    if (!state) {
      return (
        <Text>
          <Spinner /> Loading recipe
        </Text>
      )
    }
    /*
     * TODOs
     * Listen to "y" to continue (in addition to enter)
     */

    log(`render`, `${renderCount} ${new Date().toJSON()}`)
    renderCount += 1

    // If we're done, exit.
    if (state.value === `done`) {
      process.nextTick(() => process.exit())
    }
    if (state.value === `doneError`) {
      process.nextTick(() => process.exit())
    }

    if (process.env.DEBUG) {
      log(`state`, state)
      log(`plan`, state.context.plan)
      log(`stepResources`, state.context.stepResources)
    }

    const PresentStep = ({ state }) => {
      const isPlan = state.context.plan && state.context.plan.length > 0
      const isPresetPlanState = state.value === `present plan`
      const isRunningStep = state.value === `applyingPlan`
      const isDone = state.value === `done`
      const isLastStep =
        state.context.steps &&
        state.context.steps.length - 1 === state.context.currentStep

      if (isRunningStep) {
        return null
      }

      if (isDone) {
        return null
      }

      // If there's no plan on the last step, just return.
      if (!isPlan && isLastStep) {
        process.nextTick(() => process.exit())
        return null
      }

      if (!isPlan || !isPresetPlanState) {
        return (
          <Div marginTop={1}>
            <Text>Press enter to continue</Text>
          </Div>
        )
      }

      return (
        <Div>
          <Div>
            <Text bold underline marginBottom={2}>
              Proposed changes
            </Text>
          </Div>
          {state.context.plan.map((p, i) => (
            <Div marginTop={1} key={`${p.resourceName} plan ${i}`}>
              <Text italic>{p.resourceName}:</Text>
              <Text> * {p.describe}</Text>
              {p.diff && p.diff !== `` && (
                <>
                  <Text>---</Text>
                  <Text>{p.diff}</Text>
                  <Text>---</Text>
                </>
              )}
            </Div>
          ))}
          <Div marginTop={1}>
            <Text>Do you want to run this step? Y/n</Text>
          </Div>
        </Div>
      )
    }

    const RunningStep = ({ state }) => {
      const isPlan = state.context.plan && state.context.plan.length > 0
      const isRunningStep = state.value === `applyingPlan`

      if (!isPlan || !isRunningStep) {
        return null
      }

      return (
        <Div>
          {state.context.plan.map((p, i) => (
            <Div key={`${p.resourceName}-${i}`}>
              <Text italic>{p.resourceName}:</Text>
              <Text>
                {` `}
                <Spinner /> {p.describe}
              </Text>
            </Div>
          ))}
        </Div>
      )
    }

    const Error = ({ state }) => {
      log(`errors`, state)
      if (state && state.context && state.context.error) {
        if (false) {
          return (
            <Div>
              <Color marginBottom={1} red>
                The following resources failed validation
              </Color>
              {state.context.error.map((err, i) => {
                log(`recipe er`, { err })
                return (
                  <Div key={`error-box-${i}`}>
                    <Text>Type: {err.resource}</Text>
                    <Text>
                      Resource:{` `}
                      {JSON.stringify(err.resourceDeclaration, null, 4)}
                    </Text>
                    <Text>Recipe step: {err.step}</Text>
                    <Text>
                      Error{err.validationError.details.length > 1 && `s`}:
                    </Text>
                    {err.validationError.details.map((d, v) => (
                      <Text key={`validation-error-${v}`}> ‣ {d.message}</Text>
                    ))}
                  </Div>
                )
              })}
            </Div>
          )
        } else {
          return (
            <Color red>{JSON.stringify(state.context.error, null, 2)}</Color>
          )
        }
      }

      return null
    }

    if (state.value === `doneError`) {
      return <Error width="100%" state={state} />
    }

    return (
      <>
        <Static>
          {lodash.flattenDeep(state.context.stepResources).map((r, i) => (
            <Text key={`finished-stuff-${i}`}>✅ {r._message}</Text>
          ))}
        </Static>
        {state.context.currentStep > 0 && state.value !== `done` && (
          <Div>
            <Text>
              Step {state.context.currentStep} /{` `}
              {state.context.steps.length - 1}
            </Text>
          </Div>
        )}
        <PlanContext.Provider value={{ planForNextStep: state.plan }}>
          <MDX components={components}>
            {state.context.stepsAsMdx[state.context.currentStep]}
          </MDX>
          <PresentStep state={state} />
          <RunningStep state={state} />
        </PlanContext.Provider>
      </>
    )
  }

  const Wrapper = () => (
    <Div>
      <Provider value={client}>
        <Text>{` `}</Text>
        <RecipeInterpreter />
      </Provider>
    </Div>
  )

  const Recipe = () => <Wrapper />

  // Enable experimental mode for more efficient reconciler and renderer
  render(<Recipe />, { experimental: true })
}
