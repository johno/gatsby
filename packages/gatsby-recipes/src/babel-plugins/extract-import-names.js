import { declare } from "@babel/helper-plugin-utils"

class BabelPluginExtractImportNames {
  constructor() {
    const names = {}
    this.state = names

    this.plugin = declare(api => {
      api.assertVersion(7)

      return {
        visitor: {
          ImportDeclaration(path) {
            const source = path.node.source.value
            path.traverse({
              Identifier(path) {
                if (path.key === `local`) {
                  names[path.node.name] = source
                }
              },
            })
          },
        },
      }
    })
  }
}

export default BabelPluginExtractImportNames
