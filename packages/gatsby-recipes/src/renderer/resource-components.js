const React = require(`react`)
const { Suspense, useContext } = require(`react`)

const ResourceContext = React.createContext({})
const useResourceContext = resourceName => {
  const context = useContext(ResourceContext)
  console.log(context[resourceName])
  return context[resourceName]
}

const resources = require(`../resources`)

const { ResourceComponent } = require(`./render`)

const resourceComponents = Object.keys(resources).reduce(
  (acc, resourceName) => {
    acc[resourceName] = props => (
      <ResourceComponent _resourceName={resourceName} {...props} />
    )

    // Make sure the component is pretty printed in reconciler output
    acc[resourceName].displayName = resourceName

    return acc
  },
  {}
)

resourceComponents.ContentfulSpace = ({ children, ...props }) => (
  <ResourceContext.Provider
    value={{
      contentfulSpace: {
        hello: `world!`,
        ...props,
      },
    }}
  >
    <Suspense fallback={<p>Setting up space...</p>}>
      {React.createElement(`ContentfulSpace`, {}, children)}
    </Suspense>
  </ResourceContext.Provider>
)

resourceComponents.ContentfulEnvironment = props => {
  const data = useResourceContext(`contentfulSpace`)

  return React.createElement(
    `ContentfulEnvironment`,
    {},
    JSON.stringify({ ...data, ...props })
  )
}

module.exports = resourceComponents
