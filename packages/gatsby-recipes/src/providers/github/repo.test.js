const repo = require(`./repo`)

describe(`github-repo`, () => {
  test(`creates a repository`, async () => {
    const createResult = await repo.create(
      {},
      {
        name: `test-test-test`,
        visibility: `PRIVATE`,
      }
    )

    const readResult = await repo.read({}, `johno/test-test-test`)
    const destroyResult = await repo.destroy({}, `johno/test-test-test`)

    expect(createResult).toEqual(readResult)
    expect(createResult).toEqual(destroyResult)

    const readResultAfterDestroy = await repo.read({}, createResult.id)

    expect(readResultAfterDestroy).toBeNull()
  })
})
