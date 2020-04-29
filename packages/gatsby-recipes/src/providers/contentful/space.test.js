const space = require(`./space`)

describe(`contentful-space`, () => {
  test(`creates a space`, async () => {
    const createResult = await space.create({}, { name: `test-space` })
    console.log(createResult)
    const allSpaces = await space.all()

    await space.destroy(createResult.id)
    console.log(JSON.stringify(allSpaces, null, 2))
  })
})
