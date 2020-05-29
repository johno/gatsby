import { Machine, assign } from "xstate"
import Debug from "debug"

import createPlan from "../create-plan"
import applyPlan from "../apply-plan"
import validateSteps from "../validate-steps"
import parser from "../parser"

const debug = Debug(`recipes-machine`)

const recipeMachine = Machine(
  {
    id: `recipe`,
    initial: `parsingRecipe`,
    context: {
      recipePath: null,
      projectRoot: null,
      currentStep: 0,
      steps: [],
      plan: [],
      commands: [],
      stepResources: [],
      stepsAsMdx: [],
      renderContext: {},
    },
    states: {
      parsingRecipe: {
        invoke: {
          id: `parseRecipe`,
          src: async (context, _event) => {
            let parsed

            debug(`parsingRecipe`)

            if (context.src) {
              parsed = await parser.parse(context.src)
            } else if (context.recipePath && context.projectRoot) {
              parsed = await parser(context.recipePath, context.projectRoot)
            } else {
              throw new Error(
                JSON.stringify({
                  validationError: `A recipe must be specified`,
                })
              )
            }

            debug(`parsedRecipe`)

            return parsed
          },
          onError: {
            target: `doneError`,
            actions: assign({
              error: (context, event) => {
                debug(`error parsing recipes`)

                let msg
                try {
                  msg = JSON.parse(event.data.message)
                  return msg
                } catch (e) {
                  return {
                    error: `Could not parse recipe ${context.recipePath}`,
                    e,
                  }
                }
              },
            }),
          },
          onDone: {
            target: `validateSteps`,
            actions: assign({
              steps: (context, event) => event.data.stepsAsMdx,
            }),
          },
        },
      },
      validateSteps: {
        invoke: {
          id: `validateSteps`,
          src: async (context, event) => {
            debug(`validatingSteps`)
            const result = await validateSteps(context.steps)
            if (result.length > 0) {
              debug(`errors found in validation`)
              throw new Error(JSON.stringify(result))
            }

            return undefined
          },
          onDone: `creatingPlan`,
          onError: {
            target: `doneError`,
            actions: assign({
              error: (context, event) => JSON.parse(event.data.message),
            }),
          },
        },
      },
      creatingPlan: {
        entry: [`deleteOldPlan`],
        invoke: {
          id: `createPlan`,
          src: (context, event) => async (cb, _onReceive) => {
            try {
              const result = await createPlan(context, cb)
              return result
            } catch (e) {
              throw e
            }
          },
          onDone: {
            target: `presentPlan`,
            actions: assign({
              plan: (context, event) => event.data,
            }),
          },
          onError: {
            target: `doneError`,
            actions: assign({
              error: (context, event) => event.data?.errors || event.data,
            }),
          },
        },
        on: {
          INVALID_PROPS: {
            target: `doneError`,
            actions: assign({
              error: (context, event) => event.data,
            }),
          },
          INPUT: {
            target: `waitingForInput`,
            actions: assign({
              input: (context, event) => {
                const data = event.data[0] || {}

                return {
                  resourceUuid: data.resourceUuid,
                  props: data._object,
                  details: data.details,
                }
              },
            }),
          },
        },
      },
      waitingForInput: {
        on: {
          INPUT_SENT: {
            target: `validateSteps`,
            actions: assign({
              renderContext: (context, event) => {
                console.log(JSON.stringify({ context, event }, null, 2))
                return { hello: `world` }
              },
            }),
          },
        },
      },
      presentPlan: {
        on: {
          CONTINUE: `applyingPlan`,
        },
      },
      applyingPlan: {
        // cb mechanism can be used to emit events/actions between UI and the server/renderer
        // https://xstate.js.org/docs/guides/communication.html#invoking-callbacks
        invoke: {
          id: `applyPlan`,
          src: (context, event) => cb => {
            debug(`applying plan`)
            cb(`RESET`)
            if (context.plan.length === 0) {
              return cb(`onDone`)
            }

            const interval = setInterval(() => {
              cb(`TICK`)
            }, 10000)

            // TODO pass in cb & applyPlan can update on each resource
            // update so UI can get streaming updates.
            applyPlan(context.plan)
              .then(result => {
                debug(`applied plan`)
                cb({ type: `onDone`, data: result })
              })
              .catch(error => {
                debug(`error applying plan`)
                debug(error)
                cb({ type: `onError`, data: error })
              })

            return () => clearInterval(interval)
          },
        },
        on: {
          RESET: {
            actions: assign({
              elapsed: 0,
            }),
          },
          TICK: {
            actions: assign({
              elapsed: context => (context.elapsed += 10000),
            }),
          },
          onDone: {
            target: `hasAnotherStep`,
            actions: [`addResourcesToContext`],
          },
          onError: {
            target: `doneError`,
            actions: assign({ error: (context, event) => event.data }),
          },
        },
      },
      hasAnotherStep: {
        entry: [`incrementStep`],
        on: {
          "": [
            {
              target: `creatingPlan`,
              // The 'searchValid' guard implementation details are
              // specified in the machine config
              cond: `hasNextStep`,
            },
            {
              target: `done`,
              // The 'searchValid' guard implementation details are
              // specified in the machine config
              cond: `atLastStep`,
            },
          ],
        },
      },
      done: {
        type: `final`,
      },
      doneError: {
        type: `final`,
      },
    },
  },
  {
    actions: {
      incrementStep: assign((context, event) => {
        return {
          currentStep: context.currentStep + 1,
        }
      }),
      deleteOldPlan: assign((context, event) => {
        return {
          plan: [],
        }
      }),
      addResourcesToContext: assign((context, event) => {
        if (event.data) {
          let plan = context.plan || []
          plan = plan.map(p => {
            let changedResource = event.data.find(c => c._uuid === p._uuid)
            if (!changedResource) return p
            p._message = changedResource._message
            p.isDone = true
            return p
          })
          return { plan }
        }
        return undefined
      }),
    },
    guards: {
      // XXX: Update this because it'll currently break the CLI
      hasNextStep: (context, event) => false,
      // false || context.currentStep < context.steps.length,
      atLastStep: (context, event) => true,
      // true || context.currentStep === context.steps.length,
    },
  }
)

module.exports = recipeMachine
