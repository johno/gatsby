const { interpret } = require(`xstate`)
const fs = require(`fs-extra`)
const path = require(`path`)

const recipeMachine = require(`.`)

describe(`recipe-machine`, () => {
  it(`creates empty plan when the step has no resources`, done => {
    const initialContext = {
      src: `
# Hello, world!
    `,
      currentStep: 0,
    }
    const service = interpret(
      recipeMachine.withContext(initialContext)
    ).onTransition(state => {
      if (state.value === `presentPlan`) {
        expect(state.context.plan).toEqual([])
        service.stop()
        done()
      }
    })

    service.start()
  })

  it(`creates plan for File resources`, done => {
    const initialContext = {
      src: `
# File!

---

<File path="./hi.md" content="#yo" />
    `,
      currentStep: 0,
    }
    const service = interpret(
      recipeMachine.withContext(initialContext)
    ).onTransition(state => {
      if (state.value === `presentPlan`) {
        expect(state.context.plan).toBeTruthy()
        service.stop()
        done()
      }
    })

    service.start()
  })

  it(`switches to done after the final apply step`, done => {
    const filePath = `./hi.md`
    const initialContext = {
      src: `
# File!

---

<File path="${filePath}" content="#yo" />
    `,
      currentStep: 0,
    }
    const service = interpret(
      recipeMachine.withContext(initialContext)
    ).onTransition(state => {
      // Keep simulating moving onto the next step
      if (state.value === `presentPlan`) {
        service.send(`CONTINUE`)
      }
      if (state.value === `done`) {
        const fullPath = path.join(process.cwd(), filePath)
        const fileExists = fs.pathExistsSync(fullPath)
        expect(fileExists).toBeTruthy()
        // Clean up file
        fs.unlinkSync(fullPath)
        done()
      }
    })

    service.start()
  })
})
