import { toNano } from '@ton/core'
import { Merkle } from '../wrappers/Merkle'
import { compile, NetworkProvider } from '@ton/blueprint'

export async function run(provider: NetworkProvider) {
  const merkle = provider.open(Merkle.createFromConfig({}, await compile('Merkle')))

  await merkle.sendDeploy(provider.sender(), toNano('0.05'))

  await provider.waitForDeploy(merkle.address)

  // run methods on `merkle`
}
